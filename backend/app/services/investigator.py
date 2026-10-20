import json
import os

import httpx
from pydantic import ValidationError

from ..models import Dispute
from ..schemas import InvestigationResult, Outcome
from .policies import POLICY_BY_ID, policy_context, policies_for_category

CATEGORY_TERMS = {
    "access_failure": ("access", "code", "enter", "denied", "inaccessible", "locked"),
    "amenity_failure": ("projector", "amenity", "wifi", "wi-fi", "screen", "whiteboard"),
    "cancellation": ("cancel", "cancellation"),
    "property_damage": ("damage", "damaged", "broken", "chair"),
    "noise": ("noise", "noisy", "loud", "construction", "disruption"),
}


def _case_text(dispute: Dispute) -> str:
    return f"{dispute.customer_complaint} {dispute.owner_statement} {dispute.cancellation_details}".lower()


def detect_category(dispute: Dispute) -> str:
    text = _case_text(dispute)
    for category, terms in CATEGORY_TERMS.items():
        if any(term in text for term in terms):
            return category
    return "general"


def _demo_result(dispute: Dispute, category: str) -> InvestigationResult:
    facts = [
        f"Case record lists booking {dispute.booking_id} for {dispute.listing_name}, amount {dispute.currency} {dispute.booking_amount:.2f}.",
        f"Booking details supplied in the case record: {dispute.booking_details}",
    ]
    if dispute.advertised_amenities:
        facts.append("The submitted listing information names these amenities: " + ", ".join(dispute.advertised_amenities) + ".")
    if dispute.evidence_references:
        facts.append(f"The case intake includes {len(dispute.evidence_references)} evidence reference(s); the underlying artifacts have not been independently authenticated by this demo.")

    claims = [dispute.customer_complaint]
    owner_claims = [dispute.owner_statement]
    gaps: list[str] = []
    policy_ids = [policy.id for policy in policies_for_category(category)]

    outcome = Outcome.MANUAL_REVIEW
    needs_review = True
    confidence = 0.46
    reasoning = "DEMO MODE uses conservative rules over submitted text only. The intake does not independently authenticate evidence, so an administrator must review the underlying records."

    if category == "amenity_failure":
        gaps.append("An authenticated listing snapshot and independent record or contemporaneous evidence confirming the amenity outage and its impact.")
        reasoning = "The listing amenities and complaint describe a possible advertised-amenity mismatch, but the supplied references alone do not authenticate that the amenity failed. No fixed refund percentage is defined by policy."
    elif category == "access_failure":
        gaps.append("Building access logs or a host/platform access record to resolve the disputed access failure.")
        reasoning = "The customer reports complete denial of access and the case includes an access-error reference, but no building access log is supplied. The access policy requires human review where access records are absent or conflicting."
    elif category == "cancellation":
        gaps.append("The exact cancellation terms shown to the customer at booking time.")
        reasoning = "A cancellation timestamp is recorded, but the cancellation terms in force at booking are missing. The policy does not support inferring a refund amount without those terms."
    elif category == "property_damage":
        gaps.append("A pre-booking condition report and evidence linking the alleged damage to this booking.")
        reasoning = "The owner alleges damage but has no before-booking condition evidence. An after-booking photo alone cannot establish when damage occurred or who caused it."
    elif category == "noise":
        gaps.append("Contemporaneous evidence of noise level, duration, and effect inside the booked space.")
        reasoning = "The customer reports disruption and the owner acknowledges nearby maintenance, but the case lacks evidence of noise inside the room or its impact."
    else:
        gaps.append("Evidence sufficient to classify the issue and apply a specific marketplace policy.")

    return InvestigationResult(
        case_id=dispute.case_id,
        issue_category=category,
        verified_facts=facts,
        customer_claims=claims,
        owner_claims=owner_claims,
        evidence_gaps=gaps,
        policy_references=policy_ids,
        recommended_outcome=outcome,
        reasoning_summary=reasoning,
        confidence=confidence,
        requires_human_review=needs_review,
    )


async def investigate(dispute: Dispute) -> tuple[InvestigationResult, str]:
    category = detect_category(dispute)
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return _demo_result(dispute, category), "demo"

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You investigate marketplace booking disputes. Return only a JSON object matching the requested fields. "
                    "Separate allegations from verified facts. Only case-record fields and explicitly supplied evidence references "
                    "may be stated as facts; references are not authenticated artifacts. Do not invent evidence, policy rules, "
                    "refund percentages, or certainty. Use only the supplied policy IDs. Recommend manual investigation when "
                    "material evidence is missing or contradictory. The administrator makes the final decision."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "required_fields": list(InvestigationResult.model_fields),
                    "allowed_outcomes": [outcome.value for outcome in Outcome],
                    "case": {
                        "case_id": dispute.case_id,
                        "booking_id": dispute.booking_id,
                        "booking_amount": dispute.booking_amount,
                        "currency": dispute.currency,
                        "listing_name": dispute.listing_name,
                        "advertised_amenities": dispute.advertised_amenities,
                        "customer_complaint": dispute.customer_complaint,
                        "owner_statement": dispute.owner_statement,
                        "booking_details": dispute.booking_details,
                        "cancellation_details": dispute.cancellation_details,
                        "evidence_references": dispute.evidence_references,
                        "detected_issue_category": category,
                    },
                    "applicable_policies": policy_context(category),
                }),
            },
        ],
    }
    timeout_seconds = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "120"))
    timeout = httpx.Timeout(timeout_seconds, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    response.raise_for_status()
    try:
        body = response.json()
    except ValueError as exc:
        raise ValueError("AI provider returned an invalid JSON response") from exc
    try:
        content = body["choices"][0]["message"]["content"]
        result = InvestigationResult.model_validate_json(content)
    except (KeyError, IndexError, TypeError, ValidationError) as exc:
        raise ValueError("AI provider returned an invalid investigation JSON response") from exc

    if result.case_id != dispute.case_id:
        raise ValueError("AI provider response case_id does not match the requested case")
    if not result.policy_references or any(ref not in POLICY_BY_ID for ref in result.policy_references):
        raise ValueError("AI provider response contains missing or unknown policy references")
    if result.issue_category not in CATEGORY_TERMS and result.issue_category != "general":
        raise ValueError("AI provider response contains an unsupported issue category")
    return result, "llm"
