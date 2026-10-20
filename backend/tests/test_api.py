import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

_test_directory = tempfile.TemporaryDirectory(prefix="booking-dispute-tests-")
_database_file = Path(_test_directory.name) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_database_file.as_posix()}"

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.routers.disputes import seed_samples


class DisputeApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        engine.dispose()
        _test_directory.cleanup()

    def setUp(self):
        self._demo_provider_environment = patch.dict(os.environ, {"OPENAI_API_KEY": ""})
        self._demo_provider_environment.start()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            seed_samples(db)

    def tearDown(self):
        self._demo_provider_environment.stop()

    def test_dashboard_and_sample_categories(self):
        stats = self.client.get("/disputes/stats")
        disputes = self.client.get("/disputes")

        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.json()["total_disputes"], 5)
        self.assertEqual({row["currency"] for row in disputes.json()}, {"INR"})
        self.assertEqual(
            {row["issue_category"] for row in disputes.json()},
            {"amenity_failure", "access_failure", "cancellation", "property_damage", "noise"},
        )

    def test_required_fields_are_validated(self):
        response = self.client.post("/disputes", json={"booking_id": "x"})
        self.assertEqual(response.status_code, 422)
        invalid_currency = self.client.post(
            "/disputes",
            json={
                "booking_id": "BK-USD-TEST",
                "booking_amount": 120,
                "currency": "USD",
                "listing_name": "Riverside Meeting Room",
                "customer_complaint": "The advertised projector did not work.",
                "owner_statement": "It was working yesterday.",
                "booking_details": "Booked for two hours.",
            },
        )
        self.assertEqual(invalid_currency.status_code, 422)
        self.assertEqual(self.client.get("/disputes/stats").json()["total_disputes"], 5)

    def test_creation_and_decision_guard(self):
        payload = {
            "booking_id": "BK-TEST-100",
            "booking_amount": 120,
            "listing_name": "Riverside Meeting Room",
            "advertised_amenities": ["Projector"],
            "customer_complaint": "The projector failed during our meeting.",
            "owner_statement": "It worked the day before.",
            "booking_details": "Booked for two hours on 2026-10-20.",
        }
        created = self.client.post("/disputes", json=payload)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["issue_category"], "amenity_failure")

        decision = self.client.post(
            f"/disputes/{created.json()['case_id']}/decision",
            json={"outcome": "No refund", "reason": "Insufficient review."},
        )
        self.assertEqual(decision.status_code, 409)

    def test_insufficient_evidence_investigation_and_persisted_decision(self):
        case_id = "DSP-2026-003"
        result = self.client.post(f"/disputes/{case_id}/investigate")
        self.assertEqual(result.status_code, 200)
        investigation = result.json()
        self.assertEqual(investigation["provider"], "demo")
        self.assertEqual(self.client.get("/disputes/stats").json()["manual_investigations"], 1)
        self.assertEqual(
            investigation["recommended_outcome"],
            "Manual investigation / insufficient evidence",
        )
        self.assertTrue(investigation["requires_human_review"])
        known_policy_ids = {policy["id"] for policy in self.client.get("/policies").json()}
        self.assertTrue(set(investigation["policy_references"]).issubset(known_policy_ids))

        decision = self.client.post(
            f"/disputes/{case_id}/decision",
            json={
                "outcome": "Manual investigation / insufficient evidence",
                "reason": "Booking-time cancellation terms are missing.",
                "reviewer": "Test Admin",
            },
        )
        self.assertEqual(decision.status_code, 200)
        refreshed = self.client.get(f"/disputes/{case_id}").json()
        self.assertEqual(refreshed["decisions"][0]["reviewer"], "Test Admin")
        self.assertEqual(refreshed["status"], "approved")
        self.assertEqual(self.client.get("/disputes/stats").json()["manual_investigations"], 0)

    def test_conflicting_damage_claims_are_referred_for_manual_review(self):
        case_id = "DSP-2026-004"
        result = self.client.post(f"/disputes/{case_id}/investigate")
        self.assertEqual(result.status_code, 200)
        investigation = result.json()
        self.assertEqual(investigation["issue_category"], "property_damage")
        self.assertTrue(investigation["requires_human_review"])
        self.assertEqual(
            investigation["recommended_outcome"],
            "Manual investigation / insufficient evidence",
        )
        self.assertTrue(investigation["customer_claims"])
        self.assertTrue(investigation["owner_claims"])
        self.assertTrue(investigation["evidence_gaps"])

    def test_all_outcomes_are_accepted_from_structured_provider_and_admin(self):
        outcomes = [
            "Full refund",
            "Partial refund",
            "No refund",
            "Manual investigation / insufficient evidence",
        ]

        for index, outcome in enumerate(outcomes, start=1):
            case_id = f"DSP-2026-{index:03d}"
            provider_payload = {
                "case_id": case_id,
                "issue_category": "amenity_failure",
                "verified_facts": ["The submitted booking record contains a booking ID."],
                "customer_claims": ["Customer reports an issue."],
                "owner_claims": ["Owner gives a different account."],
                "evidence_gaps": ["An independent record is not available."],
                "policy_references": ["POL-AMENITY-01", "POL-EVIDENCE-01"],
                "recommended_outcome": outcome,
                "reasoning_summary": "Mock provider response used to validate the schema and decision path.",
                "confidence": 0.5,
                "requires_human_review": outcome == "Manual investigation / insufficient evidence",
            }
            fake_response = _ProviderResponse({
                "choices": [{"message": {"content": json.dumps(provider_payload)}}]
            })
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                with patch("app.services.investigator.httpx.AsyncClient", _provider_client(fake_response)):
                    investigation = self.client.post(f"/disputes/{case_id}/investigate")
                self.assertEqual(investigation.status_code, 200, investigation.text)
                self.assertEqual(investigation.json()["provider"], "llm")
                self.assertEqual(investigation.json()["recommended_outcome"], outcome)

            decision = self.client.post(
                f"/disputes/{case_id}/decision",
                json={"outcome": outcome, "reason": "Administrator reviewed the case evidence."},
            )
            self.assertEqual(decision.status_code, 200, decision.text)
            self.assertEqual(decision.json()["decisions"][0]["outcome"], outcome)

    def test_provider_timeout_http_error_and_invalid_output_do_not_persist(self):
        case_id = "DSP-2026-001"
        failures = [
            (httpx.ReadTimeout("mock timeout"), 504),
            (
                httpx.HTTPStatusError(
                    "mock provider error",
                    request=httpx.Request("POST", "https://provider.invalid/chat/completions"),
                    response=httpx.Response(503),
                ),
                502,
            ),
        ]
        for error, expected_status in failures:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
                with patch("app.services.investigator.httpx.AsyncClient", _provider_client(error=error)):
                    response = self.client.post(f"/disputes/{case_id}/investigate")
            self.assertEqual(response.status_code, expected_status, response.text)
            self.assertEqual(
                self.client.get(f"/disputes/{case_id}/investigation").status_code,
                404,
            )

        invalid_response = _ProviderResponse({"choices": [{"message": {"content": "not JSON"}}]})
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            with patch("app.services.investigator.httpx.AsyncClient", _provider_client(invalid_response)):
                response = self.client.post(f"/disputes/{case_id}/investigate")
        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(
            self.client.get(f"/disputes/{case_id}/investigation").status_code,
            404,
        )

    def test_unknown_case_returns_404(self):
        self.assertEqual(self.client.get("/disputes/DSP-NOT-FOUND").status_code, 404)

    def test_cors_allows_local_frontend_and_rejects_other_origin(self):
        allowed = self.client.options(
            "/disputes",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        rejected = self.client.options(
            "/disputes",
            headers={
                "Origin": "http://localhost:4173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(
            allowed.headers.get("access-control-allow-origin"),
            "http://127.0.0.1:5173",
        )
        self.assertEqual(rejected.status_code, 400)


class _ProviderResponse:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        return None

    def json(self):
        return self.body


def _provider_client(response=None, error=None):
    class FakeAsyncClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            if error:
                raise error
            return response

    return FakeAsyncClient


if __name__ == "__main__":
    unittest.main()
