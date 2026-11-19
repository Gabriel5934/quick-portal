"""The business a business-scoped request acts on."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_session
from app.auth.models import User
from app.business import service
from app.business.cnpj import InvalidCnpj, normalize_cnpj
from app.business.models import Business

BUSINESS_HEADER = "X-Business-Cnpj"


def get_current_business(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    cnpj: Annotated[str | None, Header(alias=BUSINESS_HEADER)] = None,
) -> Business:
    """``X-Business-Cnpj`` → a business the current user is a member of.

    Unknown CNPJs and businesses the user is not a member of get the same 403,
    so the response does not reveal whether a CNPJ exists.
    """
    if cnpj is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing {BUSINESS_HEADER} header.",
        )
    try:
        normalized = normalize_cnpj(cnpj)
    except InvalidCnpj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {BUSINESS_HEADER} header.",
        ) from None
    business = service.get_member_business(session, user.id, normalized)
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this business.",
        )
    return business
