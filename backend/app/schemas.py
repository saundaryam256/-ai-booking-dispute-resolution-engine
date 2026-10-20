from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Outcome(str, Enum):
    FULL_REFUND = "Full refund"
    PARTIAL_REFUND = "Partial refund"
    NO_REFUND = "No refund"
    MANUAL_REVIEW = "Manual investigation / insufficient evidence"


class DisputeCreate(BaseModel):
    booking_id: str = Field(min_length=2, max_length=100)
    booking_amount: float = Field(gt=0, le=1_000_000)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    listing_name: str = Field(min_length=2, max_length=200)
    advertised_amenities: list[str] = Field(default_factory=list, max_length=30)
    customer_complaint: str = Field(min_length=8, max_length=5000)
    owner_statement: str = Field(min_length=2, max_length=5000)
    booking_details: str = Field(min_length=2, max_length=3000)
    cancellation_details: str = Field(default="", max_length=3000)
    evidence_references: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        value = value.upper()
        if not value.isalpha():
            raise ValueError("Currency must be a 3-letter code")
        if value != "INR":
            raise ValueError("Only INR is supported")
        return value


class InvestigationResult(BaseModel):
    case_id: str
    issue_category: str
    verified_facts: list[str]
    customer_claims: list[str]
    owner_claims: list[str]
    evidence_gaps: list[str]
    policy_references: list[str]
    recommended_outcome: Outcome
    reasoning_summary: str
    confidence: float = Field(ge=0, le=1)
    requires_human_review: bool


class DecisionCreate(BaseModel):
    outcome: Outcome
    reason: str = Field(min_length=5, max_length=3000)
    reviewer: str = Field(default="Admin", min_length=2, max_length=120)


class DecisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    outcome: str
    reason: str
    reviewer: str
    created_at: datetime


class InvestigationRead(InvestigationResult):
    provider: str
    created_at: datetime


class DisputeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    case_id: str
    booking_id: str
    booking_amount: float
    currency: str
    listing_name: str
    advertised_amenities: list[str]
    customer_complaint: str
    owner_statement: str
    booking_details: str
    cancellation_details: str
    evidence_references: list[str]
    issue_category: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class DisputeDetail(DisputeRead):
    investigation: InvestigationRead | None
    decisions: list[DecisionRead]


class DashboardStats(BaseModel):
    total_disputes: int
    pending_reviews: int
    approved_decisions: int
    manual_investigations: int


class PolicyRead(BaseModel):
    id: str
    title: str
    category: str
    text: str
