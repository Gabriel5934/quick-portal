from collections.abc import Mapping

import requests
from django.core.exceptions import ValidationError

from quickportal.validators import validate_cnpj

BRASIL_API_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
BRASIL_API_BANK_URL = "https://brasilapi.com.br/api/banks/v1/{code}"
BRASIL_API_CEP_URL = "https://brasilapi.com.br/api/cep/v1/{cep}"


class BrasilApiError(Exception):
    def __init__(
        self,
        message,
        status_code=None,
        response_body=None,
        resource=None,
        reason=None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body
        self.resource = resource
        self.reason = reason


def _fetch_brasil_api_resource(url: str, resource: str) -> Mapping:
    try:
        response = requests.get(url, timeout=15)
    except requests.RequestException as exc:
        raise BrasilApiError(
            f"Connection error: {exc}",
            resource=resource,
            reason="connection",
        ) from exc

    if response.status_code != 200:
        raise BrasilApiError(
            f"Brasil API returned status {response.status_code}",
            status_code=response.status_code,
            response_body=response.text,
            resource=resource,
            reason="http_error",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise BrasilApiError(
            "Brasil API returned an invalid response",
            status_code=response.status_code,
            response_body=response.text,
            resource=resource,
            reason="invalid_response",
        ) from exc
    if not isinstance(data, Mapping):
        raise BrasilApiError(
            "Brasil API returned an invalid response",
            status_code=response.status_code,
            response_body=response.text,
            resource=resource,
            reason="invalid_response",
        )
    return data


def fetch_cnpj_registration(cnpj: str) -> dict[str, str | None]:
    try:
        validate_cnpj(cnpj)
    except ValidationError as exc:
        raise BrasilApiError(
            exc.messages[0],
            status_code=400,
            resource="cnpj",
            reason="invalid_input",
        ) from exc

    data = _fetch_brasil_api_resource(
        BRASIL_API_CNPJ_URL.format(cnpj=cnpj), "cnpj"
    )
    name = data.get("razao_social")
    trade_name = data.get("nome_fantasia") or ""
    if not isinstance(name, str) or not name.strip():
        raise BrasilApiError(
            "Brasil API response missing 'razao_social'",
            status_code=200,
            resource="cnpj",
            reason="invalid_response",
        )
    if not isinstance(trade_name, str):
        raise BrasilApiError(
            "Brasil API response contains an invalid 'nome_fantasia'",
            status_code=200,
            resource="cnpj",
            reason="invalid_response",
        )

    cnae_fiscal = data.get("cnae_fiscal")
    return {
        "cod_cnae": str(cnae_fiscal) if cnae_fiscal is not None else None,
        "trade_name": trade_name,
        "name": name,
    }


def fetch_cnpj_info(cnpj: str) -> dict[str, str]:
    info = fetch_cnpj_registration(cnpj)
    cnae_fiscal = info["cod_cnae"]
    if cnae_fiscal is None:
        raise BrasilApiError(
            "Brasil API response missing 'cnae_fiscal'",
            status_code=200,
            resource="cnpj",
            reason="invalid_response",
        )
    return {
        "cod_cnae": cnae_fiscal,
        "trade_name": info["trade_name"],
        "name": info["name"],
    }


def fetch_bank_info(code: str) -> Mapping:
    return _fetch_brasil_api_resource(BRASIL_API_BANK_URL.format(code=code), "bank")


def fetch_cep_info(cep: str) -> Mapping:
    return _fetch_brasil_api_resource(BRASIL_API_CEP_URL.format(cep=cep), "cep")
