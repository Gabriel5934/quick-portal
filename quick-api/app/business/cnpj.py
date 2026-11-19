"""CNPJ normalization.

CNPJs are stored and compared as 14 uppercase ASCII letters or digits, which
covers the alphanumeric format. Check digits are not validated.
"""

import re

CNPJ_LENGTH = 14

_NOT_ALPHANUMERIC = re.compile(r"[^0-9A-Za-z]")
_NORMALIZED = re.compile(rf"[0-9A-Z]{{{CNPJ_LENGTH}}}")


class InvalidCnpj(ValueError):
    """Not 14 letters or digits once punctuation and spaces are removed."""


def normalize_cnpj(raw: str) -> str:
    """Strips everything but ASCII letters and digits, then uppercases.

    "12.abc.345/0001-99" becomes "12ABC345000199".
    """
    cnpj = _NOT_ALPHANUMERIC.sub("", raw).upper()
    if not _NORMALIZED.fullmatch(cnpj):
        raise InvalidCnpj(f"CNPJ must have {CNPJ_LENGTH} letters or digits")
    return cnpj
