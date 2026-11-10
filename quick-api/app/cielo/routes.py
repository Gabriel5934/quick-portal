"""/cielo endpoints: seller onboarding and listing, and Beacon transactions.

Handlers are sync so the Cielo requests and SQLite calls run in FastAPI's
threadpool.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_session, get_settings
from app.auth.models import User
from app.beacon import client as beacon
from app.cielo import service
from app.cielo.client import CieloClient
from app.cielo.errors import CieloError
from app.cielo.schemas import OnboardIn, OnboardOut, TransactionPage
from app.config import Settings

SELLER_NOT_SAVED = "Seller was onboarded at Cielo but could not be saved"
# Same paging limits as Beacon's GET /transactions.
DEFAULT_TRANSACTIONS_LIMIT = 50
MAX_TRANSACTIONS_LIMIT = 100

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
        content=seller.to_out(body.fancy_name).model_dump(mode="json"),
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


@cielo_router.get(
    "/transactions",
    response_model=TransactionPage,
    dependencies=[Depends(get_current_user)],
    responses={
        401: {"description": "Missing or invalid access token"},
        502: {"description": "Beacon failed or sent an invalid page", **_MESSAGE},
        503: {"description": "Beacon is not configured", **_MESSAGE},
        504: {"description": "Beacon timed out", **_MESSAGE},
    },
)
def list_transactions(
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    limit: Annotated[
        int, Query(ge=1, le=MAX_TRANSACTIONS_LIMIT)
    ] = DEFAULT_TRANSACTIONS_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Response:
    """A page of Cielo transaction notifications stored by Beacon, oldest first.

    Beacon failures return ``{"message": ...}``; Beacon's own response body is
    never relayed.
    """
    # Only authentication needs the database; release it before waiting on
    # Beacon.
    session.close()
    try:
        page = TransactionPage.model_validate(
            beacon.list_transactions(settings, limit, offset)
        )
    except ValidationError:
        error: beacon.BeaconError = beacon.BeaconInvalidResponse()
    except beacon.BeaconError as exc:
        error = exc
    else:
        return JSONResponse(content=page.model_dump(mode="json"))
    return JSONResponse(
        status_code=error.status_code, content={"message": error.message}
    )
