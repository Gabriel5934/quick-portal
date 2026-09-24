from collections.abc import Mapping
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from cielo.models import (
    CieloBank,
    CieloBankAccountType,
    CieloBusiness,
    CieloBusinessActivity,
    CieloDocumentType,
    CieloSubmissionStatus,
)
from cielo.services.brasil_api import fetch_address, fetch_cnpj_names
from cielo.validators import validate_cnpj, validate_cpf


class RejectUnknownFieldsSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown_fields = set(data) - set(self.fields)
            if unknown_fields:
                raise serializers.ValidationError(
                    {
                        field: ["This field is not accepted."]
                        for field in sorted(unknown_fields)
                    }
                )
        return super().to_internal_value(data)


class CieloBankAccountInputSerializer(RejectUnknownFieldsSerializer):
    bank = serializers.ChoiceField(choices=CieloBank.choices)
    bank_account_type = serializers.ChoiceField(choices=CieloBankAccountType.choices)
    number = serializers.RegexField(r"^\d+$", max_length=10)
    verifier_digit = serializers.RegexField(r"^\d$", max_length=1)
    agency_number = serializers.RegexField(r"^\d{1,4}$", max_length=4)
    agency_digit = serializers.RegexField(
        r"^\d$", allow_blank=True, default="", required=False
    )
    document_type = serializers.ChoiceField(choices=CieloDocumentType.choices)
    document_number = serializers.CharField(max_length=14)

    def validate_agency_number(self, value):
        if set(value) == {"0"}:
            raise serializers.ValidationError("Agency number cannot contain only zeroes.")
        return value

    def validate(self, attrs):
        validator = validate_cpf if attrs["document_type"] == CieloDocumentType.CPF else validate_cnpj
        try:
            validator(attrs["document_number"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"document_number": exc.messages}
            ) from exc
        return attrs


class CieloAddressInputSerializer(RejectUnknownFieldsSerializer):
    number = serializers.RegexField(r"^\d+$", max_length=15)
    complement = serializers.CharField(max_length=80, allow_blank=True, required=False, default="")
    zip_code = serializers.RegexField(r"^\d+$", max_length=9)


class CieloBusinessCreateSerializer(RejectUnknownFieldsSerializer):
    contact_name = serializers.CharField(
        max_length=100, allow_blank=True, required=False, default=""
    )
    website = serializers.URLField(max_length=200, allow_blank=True, required=False, default="")
    birthday_date = serializers.DateField(required=False, allow_null=True)
    business_activity_id = serializers.ChoiceField(
        choices=CieloBusinessActivity.choices,
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    bank_account = CieloBankAccountInputSerializer()
    address = CieloAddressInputSerializer()

    def validate(self, attrs):
        business = self.context["business"]
        document_type = business.document_type
        document_number = business.document
        birthday_date = attrs.get("birthday_date")
        activity = attrs.get("business_activity_id")

        if not business.phone.isdigit() or len(business.phone) != 11:
            raise serializers.ValidationError(
                {"business": ["The business mobile phone must contain exactly 11 digits."]}
            )
        if len(business.email) > 50:
            raise serializers.ValidationError(
                {"business": ["The business email must contain at most 50 characters."]}
            )

        if document_type == CieloDocumentType.CPF:
            try:
                validate_cpf(document_number)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {"business": exc.messages}
                ) from exc
            if birthday_date is None:
                raise serializers.ValidationError({"birthday_date": ["This field is required for CPF sellers."]})
            if not activity:
                raise serializers.ValidationError({"business_activity_id": ["This field is required for CPF sellers."]})
            if attrs["contact_name"]:
                raise serializers.ValidationError(
                    {"contact_name": ["This field must be blank for CPF sellers."]}
                )
            if len(business.name) > 50:
                raise serializers.ValidationError(
                    {
                        "business": [
                            "The business CPF name must contain at most 50 characters."
                        ]
                    }
                )
            attrs["corporate_name"] = ""
            attrs["fancy_name"] = ""
        else:
            try:
                validate_cnpj(document_number)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {"business": exc.messages}
                ) from exc
            if not attrs["contact_name"]:
                raise serializers.ValidationError(
                    {"contact_name": ["This field is required for CNPJ sellers."]}
                )
            if birthday_date is not None:
                raise serializers.ValidationError({"birthday_date": ["This field must be null for CNPJ sellers."]})
            if activity not in {None, ""}:
                raise serializers.ValidationError({"business_activity_id": ["This field must be null for CNPJ sellers."]})
            attrs["corporate_name"], attrs["fancy_name"] = fetch_cnpj_names(
                document_number
            )
            attrs["birthday_date"] = None
            attrs["business_activity_id"] = None

        attrs.update(fetch_address(attrs["address"]["zip_code"]))
        return attrs

    def seller_values(self) -> dict:
        data = dict(self.validated_data)
        bank_account = data.pop("bank_account")
        address = data.pop("address")
        data.update(
            bank=bank_account["bank"],
            bank_account_type=bank_account["bank_account_type"],
            bank_account_number=bank_account["number"],
            bank_account_verifier_digit=bank_account["verifier_digit"],
            bank_agency_number=bank_account["agency_number"],
            bank_agency_digit=bank_account["agency_digit"],
            bank_document_type=bank_account["document_type"],
            bank_document_number=bank_account["document_number"],
            address_number=address["number"],
            address_complement=address["complement"],
            address_zip_code=address["zip_code"],
        )
        return data


class CieloBusinessSummarySerializer(serializers.ModelSerializer):
    retry_available_at = serializers.SerializerMethodField()
    can_retry = serializers.SerializerMethodField()

    class Meta:
        model = CieloBusiness
        fields = [
            "id",
            "business",
            "status",
            "merchant_id",
            "last_submitted_at",
            "retry_available_at",
            "can_retry",
        ]

    def get_retry_available_at(self, seller):
        if seller.status != CieloSubmissionStatus.FAILED or seller.last_submitted_at is None:
            return None
        return seller.last_submitted_at + timedelta(seconds=settings.CIELO_RETRY_COOLDOWN_SECONDS)

    def get_can_retry(self, seller):
        if seller.status != CieloSubmissionStatus.FAILED:
            return False
        retry_at = self.get_retry_available_at(seller)
        return retry_at is None or retry_at <= timezone.now()
