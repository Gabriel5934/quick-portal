import base64
import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from cielo.models import CieloSubmissionStatus


class CieloQuickConfigurationError(Exception):
    pass


class CieloQuickCredentialsError(Exception):
    pass


class CieloRemoteError(Exception):
    pass


@dataclass(frozen=True)
class CieloConfiguration:
    auth_base_url: str
    onboarding_base_url: str
    merchant_id: str
    client_secret: str


@dataclass(frozen=True)
class CieloSubmissionOutcome:
    status: str
    merchant_id: str | None = None
    submitted_at: datetime | None = None


def _valid_base_url(value: str) -> bool:
    parsed = urlparse(value)
    if not parsed.netloc:
        return False
    if parsed.scheme == "https":
        return True
    return (
        settings.DEBUG
        and parsed.scheme == "http"
        and parsed.hostname in {"localhost", "127.0.0.1", "::1", "mock-cielo"}
    )


def _valid_merchant_id(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 36:
        return False
    try:
        return str(UUID(value)) == value.lower()
    except ValueError:
        return False


def get_cielo_configuration() -> CieloConfiguration:
    values = {
        "CIELO_AUTH_BASE_URL": settings.CIELO_AUTH_BASE_URL,
        "CIELO_ONBOARDING_BASE_URL": settings.CIELO_ONBOARDING_BASE_URL,
        "CIELO_MERCHANT_ID": settings.CIELO_MERCHANT_ID,
        "CIELO_CLIENT_SECRET": settings.CIELO_CLIENT_SECRET,
    }
    missing = [name for name, value in values.items() if not isinstance(value, str) or not value.strip()]
    if missing:
        raise CieloQuickConfigurationError(
            f"Configuração Cielo ausente: {', '.join(missing)}."
        )
    if not _valid_base_url(values["CIELO_AUTH_BASE_URL"]) or not _valid_base_url(
        values["CIELO_ONBOARDING_BASE_URL"]
    ):
        raise CieloQuickConfigurationError("As URLs configuradas para a Cielo são inválidas.")
    if not _valid_merchant_id(values["CIELO_MERCHANT_ID"]):
        raise CieloQuickConfigurationError("CIELO_MERCHANT_ID deve ser um UUID válido.")
    return CieloConfiguration(
        auth_base_url=values["CIELO_AUTH_BASE_URL"].rstrip("/"),
        onboarding_base_url=values["CIELO_ONBOARDING_BASE_URL"].rstrip("/"),
        merchant_id=values["CIELO_MERCHANT_ID"],
        client_secret=values["CIELO_CLIENT_SECRET"],
    )


def _token_cache_key(configuration: CieloConfiguration) -> str:
    identity = f"{configuration.auth_base_url}:{configuration.merchant_id}".encode()
    return f"cielo_access_token:{hashlib.sha256(identity).hexdigest()}"


def _response_json(response) -> Mapping | None:
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, Mapping) else None


def get_cielo_token(configuration: CieloConfiguration) -> str:
    cache_key = _token_cache_key(configuration)
    cached_token = cache.get(cache_key)
    if cached_token:
        return cached_token

    credentials = f"{configuration.merchant_id}:{configuration.client_secret}".encode()
    authorization = base64.b64encode(credentials).decode("ascii")
    try:
        response = requests.post(
            f"{configuration.auth_base_url}/oauth2/token",
            data={"grant_type": "client_credentials"},
            headers={
                "Authorization": f"Basic {authorization}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        raise CieloRemoteError("A autenticação da Cielo está indisponível.") from exc

    data = _response_json(response)
    if data and data.get("error") == "invalid_client":
        raise CieloQuickCredentialsError("As credenciais configuradas para a Cielo foram rejeitadas.")
    if response.status_code != 200:
        raise CieloRemoteError("A autenticação da Cielo está indisponível.")

    access_token = data.get("access_token") if data else None
    expires_in = data.get("expires_in") if data else None
    if (
        not isinstance(access_token, str)
        or not access_token
        or isinstance(expires_in, bool)
        or not isinstance(expires_in, (int, float))
        or expires_in <= 0
    ):
        raise CieloRemoteError("A autenticação da Cielo retornou uma resposta inválida.")

    cache.set(cache_key, access_token, timeout=max(int(expires_in) - 10, 1))
    return access_token


def build_cielo_payload(seller, merchant_id: str) -> dict:
    business = seller.business
    contact_name = (
        business.name if business.document_type == "CPF" else seller.contact_name
    )
    corporate_name = (
        business.name if business.document_type == "CPF" else seller.corporate_name
    )
    fancy_name = (
        business.name if business.document_type == "CPF" else seller.fancy_name
    )
    bank_account = {
        "Bank": seller.bank,
        "BankAccountType": seller.bank_account_type,
        "Number": seller.bank_account_number,
        "VerifierDigit": seller.bank_account_verifier_digit,
        "AgencyNumber": seller.bank_agency_number,
        "DocumentType": seller.bank_document_type,
        "DocumentNumber": seller.bank_document_number,
    }
    if seller.bank_agency_digit:
        bank_account["AgencyDigit"] = seller.bank_agency_digit

    payload = {
        "Type": "Subordinate",
        "MasterMerchantId": merchant_id,
        "ContactPhone": business.phone,
        "ContactName": contact_name,
        "MailAddress": business.email,
        "Website": seller.website,
        "DocumentType": business.document_type,
        "DocumentNumber": business.document,
        "CorporateName": corporate_name,
        "FancyName": fancy_name,
        "BankAccount": bank_account,
        "Address": {
            "Number": seller.address_number,
            "Complement": seller.address_complement,
            "ZipCode": seller.address_zip_code,
            "Street": seller.address_street,
            "Neighborhood": seller.address_neighborhood,
            "City": seller.address_city,
            "State": seller.address_state,
        },
    }
    if business.document_type == "CPF":
        payload["BirthdayDate"] = seller.birthday_date.isoformat()
        payload["BusinessActivityId"] = seller.business_activity_id
    return payload


def _contains_connection_reset(error: BaseException) -> bool:
    pending: list[object] = [error]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, ConnectionResetError):
            return True
        if isinstance(current, BaseException):
            pending.extend(current.args)
            if current.__cause__ is not None:
                pending.append(current.__cause__)
            if current.__context__ is not None:
                pending.append(current.__context__)
    return False


def submit_cielo_seller(seller) -> CieloSubmissionOutcome:
    configuration = get_cielo_configuration()
    payload = build_cielo_payload(seller, configuration.merchant_id)
    try:
        token = get_cielo_token(configuration)
    except CieloRemoteError:
        return CieloSubmissionOutcome(status=CieloSubmissionStatus.FAILED)

    submitted_at = timezone.now()
    try:
        response = requests.post(
            f"{configuration.onboarding_base_url}/api/merchants",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30,
        )
    except requests.ConnectTimeout:
        return CieloSubmissionOutcome(status=CieloSubmissionStatus.FAILED)
    except requests.ReadTimeout:
        return CieloSubmissionOutcome(
            status=CieloSubmissionStatus.FAILED,
            submitted_at=submitted_at,
        )
    except requests.ConnectionError as exc:
        return CieloSubmissionOutcome(
            status=CieloSubmissionStatus.FAILED,
            submitted_at=submitted_at if _contains_connection_reset(exc) else None,
        )
    except requests.RequestException:
        return CieloSubmissionOutcome(status=CieloSubmissionStatus.FAILED)

    if response is None:
        return CieloSubmissionOutcome(
            status=CieloSubmissionStatus.FAILED,
            submitted_at=submitted_at,
        )
    if not 200 <= response.status_code < 300:
        return CieloSubmissionOutcome(
            status=CieloSubmissionStatus.FAILED,
            submitted_at=submitted_at,
        )

    data = _response_json(response)
    merchant_id = data.get("MerchantId") if data else None
    if not _valid_merchant_id(merchant_id):
        return CieloSubmissionOutcome(
            status=CieloSubmissionStatus.INTERVENTION_REQUIRED,
            submitted_at=submitted_at,
        )
    return CieloSubmissionOutcome(
        status=CieloSubmissionStatus.PENDING,
        merchant_id=merchant_id,
        submitted_at=submitted_at,
    )
