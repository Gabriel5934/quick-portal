from collections.abc import Mapping

import requests
from django.core.exceptions import ValidationError

from cielo.validators import validate_cnpj


BRASIL_API_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
BRASIL_API_CEP_URL = "https://brasilapi.com.br/api/cep/v1/{cep}"


class CieloBrasilApiError(Exception):
    def __init__(self, message: str, *, field: str, status_code: int | None = None):
        super().__init__(message)
        self.field = field
        self.status_code = status_code


def _fetch(url: str, field: str) -> Mapping:
    try:
        response = requests.get(url, timeout=15)
    except requests.RequestException as exc:
        raise CieloBrasilApiError(
            "Não foi possível consultar a BrasilAPI.", field=field
        ) from exc

    if response.status_code != 200:
        raise CieloBrasilApiError(
            "Não foi possível consultar os dados informados na BrasilAPI.",
            field=field,
            status_code=response.status_code,
        )
    try:
        data = response.json()
    except ValueError as exc:
        raise CieloBrasilApiError(
            "A BrasilAPI retornou uma resposta inválida.", field=field
        ) from exc
    if not isinstance(data, Mapping):
        raise CieloBrasilApiError(
            "A BrasilAPI retornou uma resposta inválida.", field=field
        )
    return data


def fetch_cnpj_names(cnpj: str) -> tuple[str, str]:
    try:
        validate_cnpj(cnpj)
    except ValidationError as exc:
        raise CieloBrasilApiError(str(exc.messages[0]), field="document_number", status_code=400) from exc

    data = _fetch(BRASIL_API_CNPJ_URL.format(cnpj=cnpj), "document_number")
    corporate_name = data.get("razao_social")
    fancy_name = data.get("nome_fantasia") or ""
    if not isinstance(corporate_name, str) or not corporate_name.strip():
        raise CieloBrasilApiError(
            "A consulta de CNPJ não retornou a razão social.",
            field="document_number",
        )
    if not isinstance(fancy_name, str):
        raise CieloBrasilApiError(
            "A consulta de CNPJ retornou um nome fantasia inválido.",
            field="document_number",
        )
    return corporate_name, fancy_name


def fetch_address(zip_code: str) -> dict[str, str]:
    data = _fetch(BRASIL_API_CEP_URL.format(cep=zip_code), "address.zip_code")
    fields = {
        "address_street": data.get("street"),
        "address_neighborhood": data.get("neighborhood"),
        "address_city": data.get("city"),
        "address_state": data.get("state"),
    }
    if any(not isinstance(value, str) or not value.strip() for value in fields.values()):
        raise CieloBrasilApiError(
            "A consulta de CEP retornou um endereço incompleto.",
            field="address.zip_code",
        )
    if len(fields["address_state"]) != 2:
        raise CieloBrasilApiError(
            "A consulta de CEP retornou um estado inválido.",
            field="address.zip_code",
        )
    return fields
