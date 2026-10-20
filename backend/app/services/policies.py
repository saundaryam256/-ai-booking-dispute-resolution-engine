import json
from pathlib import Path

from ..schemas import PolicyRead

POLICY_PATH = Path(__file__).resolve().parents[1] / "data" / "policies.json"
POLICIES = [PolicyRead.model_validate(row) for row in json.loads(POLICY_PATH.read_text(encoding="utf-8"))]
POLICY_BY_ID = {policy.id: policy for policy in POLICIES}


def policies_for_category(category: str) -> list[PolicyRead]:
    matched = [policy for policy in POLICIES if policy.category in {category, "general"}]
    return matched or [POLICY_BY_ID["POL-EVIDENCE-01"]]


def policy_context(category: str) -> list[dict[str, str]]:
    return [policy.model_dump() for policy in policies_for_category(category)]
