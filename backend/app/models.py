from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    case_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    booking_id: Mapped[str] = mapped_column(String(100), index=True)
    booking_amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    listing_name: Mapped[str] = mapped_column(String(200))
    advertised_amenities: Mapped[list] = mapped_column(JSON, default=list)
    customer_complaint: Mapped[str] = mapped_column(Text)
    owner_statement: Mapped[str] = mapped_column(Text)
    booking_details: Mapped[str] = mapped_column(Text)
    cancellation_details: Mapped[str] = mapped_column(Text, default="")
    evidence_references: Mapped[list] = mapped_column(JSON, default=list)
    issue_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending_review", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    investigation: Mapped["Investigation | None"] = relationship(back_populates="dispute", uselist=False, cascade="all, delete-orphan")
    decisions: Mapped[list["Decision"]] = relationship(back_populates="dispute", cascade="all, delete-orphan")


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[int] = mapped_column(ForeignKey("disputes.id"), unique=True)
    issue_category: Mapped[str] = mapped_column(String(80))
    verified_facts: Mapped[list] = mapped_column(JSON)
    customer_claims: Mapped[list] = mapped_column(JSON)
    owner_claims: Mapped[list] = mapped_column(JSON)
    evidence_gaps: Mapped[list] = mapped_column(JSON)
    policy_references: Mapped[list] = mapped_column(JSON)
    recommended_outcome: Mapped[str] = mapped_column(String(50))
    reasoning_summary: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    requires_human_review: Mapped[bool] = mapped_column(default=False)
    provider: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    dispute: Mapped[Dispute] = relationship(back_populates="investigation")

    @property
    def case_id(self) -> str:
        return self.dispute.case_id


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[int] = mapped_column(ForeignKey("disputes.id"), index=True)
    outcome: Mapped[str] = mapped_column(String(50))
    reason: Mapped[str] = mapped_column(Text)
    reviewer: Mapped[str] = mapped_column(String(120), default="Admin")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    dispute: Mapped[Dispute] = relationship(back_populates="decisions")
