"""/businesses: the businesses the calling user is a member of."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_session
from app.auth.models import User
from app.business import service
from app.business.schemas import BusinessOut

business_router = APIRouter(prefix="/businesses", tags=["businesses"])


@business_router.get(
    "",
    response_model=list[BusinessOut],
    responses={401: {"description": "Missing or invalid access token"}},
)
def list_businesses(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> list[BusinessOut]:
    """Every business the calling user is a member of, ordered by CNPJ; ``[]``
    when none. Not business-scoped: no ``X-Business-Cnpj`` header is needed."""
    businesses = service.list_businesses(session, user.id)
    return [BusinessOut.model_validate(business) for business in businesses]
