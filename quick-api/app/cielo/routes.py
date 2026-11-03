"""/cielo endpoints: seller onboarding and listing.

Handlers are sync so the Cielo requests and SQLite calls run in FastAPI's
threadpool.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_session
from app.auth.models import User
from app.cielo import service
from app.cielo.client import CieloClient
from app.cielo.errors import CieloError
from app.cielo.schemas import OnboardIn, OnboardOut

SELLER_NOT_SAVED = "Seller was onboarded at Cielo but could not be saved"

cielo_router = APIRouter(prefix="/cielo", tags=["cielo"])


def get_cielo(request: Request) -> CieloClient:
    return request.app.state.cielo


SessionDep = Annotated[Session, Depends(get_session)]
CieloDep = Annotated[CieloClient, Depends(get_cielo)]

_MESSAGE = {
    "content": {
        "application/json": {"schema": {"properties": {"message": {"type": "string"}}}}
    }
}


@cielo_router.post(
    "/onboard",
    status_code=status.HTTP_201_CREATED,
    response_model=OnboardOut,
    responses={
        401: {"description": "Missing or invalid access token"},
        500: {"description": "Onboarded at Cielo but not saved", **_MESSAGE},
        502: {"description": "Invalid Cielo credentials or response", **_MESSAGE},
        504: {"description": "Cielo timed out", **_MESSAGE},
    },
)
def onboard(
    body: OnboardIn,
    user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    cielo: CieloDep,
) -> Response:
    """Onboards a seller at Cielo and links it to the calling user.

    Cielo 4xx/5xx responses other than 401 are relayed with Cielo's status and
    body.
    """
    user_id = user.id
    # Loading the user autobegan a transaction; end it so the service can run
    # its own, and so no connection is held while waiting on Cielo.
    session.close()
    try:
        seller = service.onboard(session, cielo, user_id, body)
    except CieloError as exc:
        return exc.to_response()
    except service.SellerNotSaved:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"message": SELLER_NOT_SAVED},
        )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=seller.to_out().model_dump(mode="json"),
    )


@cielo_router.get(
    "/get-sellers",
    response_model=list[OnboardOut],
    responses={401: {"description": "Missing or invalid access token"}},
)
def get_sellers(
    user: Annotated[User, Depends(get_current_user)], session: SessionDep
) -> list[OnboardOut]:
    """Every seller the calling user has a membership on; ``[]`` when none.

    Read-only: Cielo is not called. The query runs in the transaction loading
    the user began, which ``get_session`` ends when the request finishes.
    """
    sellers = service.list_sellers(session, user.id)
    return [OnboardOut.from_seller(seller) for seller in sellers]
