import re

from django.core.exceptions import ValidationError


CPF_PATTERN = re.compile(r"^\d{11}$")
CNPJ_PATTERN = re.compile(r"^[A-Z0-9]{12}\d{2}$")


def is_valid_cpf(value: str) -> bool:
    if not isinstance(value, str) or not CPF_PATTERN.fullmatch(value):
        return False
    if len(set(value)) == 1:
        return False

    digits = [int(character) for character in value]
    for length in (9, 10):
        total = sum(
            digit * weight
            for digit, weight in zip(digits[:length], range(length + 1, 1, -1))
        )
        check_digit = (total * 10 % 11) % 10
        if digits[length] != check_digit:
            return False
    return True


def _cnpj_check_digit(characters: str, weights: tuple[int, ...]) -> int:
    total = sum(
        (ord(character) - 48) * weight
        for character, weight in zip(characters, weights)
    )
    remainder = total % 11
    return 0 if remainder in {0, 1} else 11 - remainder


def is_valid_cnpj(value: str) -> bool:
    if not isinstance(value, str) or not CNPJ_PATTERN.fullmatch(value):
        return False
    if value.isdigit() and len(set(value)) == 1:
        return False

    first_digit = _cnpj_check_digit(
        value[:12], (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
    )
    second_digit = _cnpj_check_digit(
        f"{value[:12]}{first_digit}",
        (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2),
    )
    return value[-2:] == f"{first_digit}{second_digit}"


def validate_cpf(value: str) -> None:
    if not is_valid_cpf(value):
        raise ValidationError("Enter a valid CPF.")


def validate_cnpj(value: str) -> None:
    if not is_valid_cnpj(value):
        raise ValidationError("Enter a valid CNPJ.")
