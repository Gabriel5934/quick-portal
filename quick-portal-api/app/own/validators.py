from django.core.exceptions import ValidationError


def validate_cpf(value):
    """Validate CPF text ``value`` and return ``None`` when it is valid.

    ``ValidationError`` is raised for non-digit, repeated-digit, incorrectly
    sized, or invalid check-digit values.
    """
    if len(value) != 11 or not value.isdigit() or len(set(value)) == 1:
        raise ValidationError("Enter a valid CPF.")
    for position in (9, 10):
        total = sum(
            int(digit) * (position + 1 - index)
            for index, digit in enumerate(value[:position])
        )
        check_digit = (total * 10 % 11) % 10
        if check_digit != int(value[position]):
            raise ValidationError("Enter a valid CPF.")
