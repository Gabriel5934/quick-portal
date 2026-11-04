"""Calls to Cielo's Split onboarding API."""

import logging

from fastapi import status
from pydantic import ValidationError

from app.cielo import http
from app.cielo.errors import CieloInvalidCredentials, CieloInvalidResponse
from app.cielo.schemas import CieloSellerCreated, OnboardIn
from app.cielo.tokens import CieloTokenManager
from app.config import Settings

logger = logging.getLogger(__name__)


class CieloClient:
    """One per app (``app.state.cielo``), so every request shares the token
    cache."""

    def __init__(self, settings: Settings, tokens: CieloTokenManager | None = None):
        self._settings = settings
        self.tokens = tokens or CieloTokenManager(settings)

    def onboard_seller(self, seller: OnboardIn) -> CieloSellerCreated:
        """Creates the seller at Cielo.

        Raises CieloInvalidCredentials when Cielo rejects the token (which
        clears it from the cache), CieloUpstreamError for other 4xx/5xx,
        CieloInvalidResponse for a success without Id, DocumentType and
        DocumentNumber, and CieloTimeout/CieloUnavailable for transport errors.
        """
        token = self.tokens.get_token()
        response = http.post(
            self._settings.cielo_onboarding_url,
            json=seller.to_cielo(self._settings.cielo_master_merchant_id),
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        if response.status_code == status.HTTP_401_UNAUTHORIZED:
            logger.warning("Cielo rejected the access token; clearing the cache")
            self.tokens.clear(token)
            raise CieloInvalidCredentials
        if response.status_code >= status.HTTP_400_BAD_REQUEST:
            logger.warning("Cielo onboarding failed (%d)", response.status_code)
            raise http.relay(response)
        if not http.is_success(response):
            raise CieloInvalidResponse
        try:
            return CieloSellerCreated.model_validate_json(response.content)
        except ValidationError:
            # Field names only: the errors' input values hold seller data.
            logger.warning("Cielo onboarding response is missing required fields")
            raise CieloInvalidResponse from None
