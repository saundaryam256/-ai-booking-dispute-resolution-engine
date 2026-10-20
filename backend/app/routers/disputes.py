import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Decision, Dispute, Investigation
from ..schemas import (
    DashboardStats,
    DecisionCreate,
    DisputeCreate,
    DisputeDetail,
    DisputeRead,
    InvestigationRead,
)
from ..services.investigator import detect_category, investigate
from ..services.policies import POLICIES, POLICY_BY_ID, policies_for_category

router = APIRouter(prefix="/disputes", tags=["disputes"])
SAMPLE_PATH = Path(__file__).resolve().parents[1] / "data" / "sample_disputes.json"


def _new_case_id() -> str:
    return f"DSP-{uuid.uuid4().hex[:8].upper()}"


def seed_samples(db: Session) -> None:
    if db.scalar(select(func.count(Dispute.id))):
        disputes = db.scalars(select(Dispute)).all()
        changed = False
        for dispute in disputes:
            if dispute.currency != "INR":
                dispute.currency = "INR"
                changed = True
            if dispute.issue_category is None:
                dispute.issue_category = detect_category(dispute)
                changed = True
        if changed:
            db.commit()
        return
    rows = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    for index, row in enumerate(rows, start=1):
        dispute = Dispute(case_id=f"DSP-2026-{index:03d}", **row)
        dispute.issue_category = detect_category(dispute)
        db.add(dispute)
    db.commit()


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(Dispute.id))) or 0
    pending = db.scalar(select(func.count(Dispute.id)).where(Dispute.status == "pending_review")) or 0
    approved = db.scalar(
        select(func.count(Dispute.id)).where(Dispute.status == "approved")
    ) or 0
    manual = db.scalar(
        select(func.count(Dispute.id)).where(Dispute.status == "manual_review")
    ) or 0
    return DashboardStats(
        total_disputes=total,
        pending_reviews=pending,
        approved_decisions=approved,
        manual_investigations=manual,
    )


@router.get("", response_model=list[DisputeRead])
def list_disputes(
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = select(Dispute).order_by(Dispute.created_at.desc())
    if status_filter:
        query = query.where(Dispute.status == status_filter)
    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            Dispute.case_id.ilike(term)
            | Dispute.booking_id.ilike(term)
            | Dispute.listing_name.ilike(term)
            | Dispute.customer_complaint.ilike(term)
        )
    return db.scalars(query).all()


@router.post("", response_model=DisputeRead, status_code=status.HTTP_201_CREATED)
def create_dispute(payload: DisputeCreate, db: Session = Depends(get_db)):
    dispute = Dispute(case_id=_new_case_id(), **payload.model_dump())
    dispute.issue_category = detect_category(dispute)
    db.add(dispute)
    db.commit()
    db.refresh(dispute)
    return dispute


@router.get("/{case_id}", response_model=DisputeDetail)
def get_dispute(case_id: str, db: Session = Depends(get_db)):
    dispute = db.scalar(
        select(Dispute)
        .options(joinedload(Dispute.investigation), joinedload(Dispute.decisions))
        .where(Dispute.case_id == case_id)
    )
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return dispute


@router.post("/{case_id}/investigate", response_model=InvestigationRead)
async def investigate_dispute(case_id: str, db: Session = Depends(get_db)):
    dispute = db.scalar(select(Dispute).where(Dispute.case_id == case_id))
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    try:
        result, provider = await investigate(dispute)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="AI provider timed out; no investigation was saved") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"AI provider returned HTTP {exc.response.status_code}; no investigation was saved") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="AI provider could not be reached; no investigation was saved") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    unknown_refs = [ref for ref in result.policy_references if ref not in POLICY_BY_ID]
    if unknown_refs:
        raise HTTPException(status_code=502, detail="Investigation contains an unknown policy reference")

    investigation = db.scalar(select(Investigation).where(Investigation.dispute_id == dispute.id))
    if investigation is None:
        investigation = Investigation(dispute_id=dispute.id)
        db.add(investigation)
    for key, value in result.model_dump().items():
        if key != "case_id":
            setattr(investigation, key, value.value if hasattr(value, "value") else value)
    investigation.provider = provider
    dispute.issue_category = result.issue_category
    dispute.status = "manual_review" if result.requires_human_review else "investigated"
    dispute.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(investigation)
    return investigation


@router.get("/{case_id}/investigation", response_model=InvestigationRead)
def get_investigation(case_id: str, db: Session = Depends(get_db)):
    investigation = db.scalar(
        select(Investigation)
        .join(Dispute)
        .where(Dispute.case_id == case_id)
    )
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return investigation


@router.post("/{case_id}/decision", response_model=DisputeDetail)
def save_decision(case_id: str, payload: DecisionCreate, db: Session = Depends(get_db)):
    dispute = db.scalar(
        select(Dispute)
        .options(joinedload(Dispute.investigation), joinedload(Dispute.decisions))
        .where(Dispute.case_id == case_id)
    )
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if not dispute.investigation:
        raise HTTPException(status_code=409, detail="Investigate this dispute before recording an admin decision")
    decision = Decision(
        dispute_id=dispute.id,
        outcome=payload.outcome.value,
        reason=payload.reason,
        reviewer=payload.reviewer,
    )
    db.add(decision)
    if payload.outcome.value == dispute.investigation.recommended_outcome:
        dispute.status = "approved"
    elif payload.outcome.value == "Manual investigation / insufficient evidence":
        dispute.status = "manual_review"
    else:
        dispute.status = "modified"
    dispute.updated_at = datetime.now(timezone.utc)
    db.commit()
    return get_dispute(case_id, db)
