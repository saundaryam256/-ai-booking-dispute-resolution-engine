from fastapi import APIRouter

from ..schemas import PolicyRead
from ..services.policies import POLICIES

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=list[PolicyRead])
def list_policies():
    return POLICIES
