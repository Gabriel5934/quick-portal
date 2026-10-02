from collections.abc import Mapping
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from cielo.models import (
    CIELO_PLAN_MAX_INSTALLMENTS,
    CieloBank,
    CieloBankAccountStatus,
    CieloBankAccountType,
    CieloBusiness,
    CieloBusinessActivity,
    CieloDocumentType,
    CieloKycStatus,
    CieloOnboardingStatus,
    CieloPaymentMethod,
    CieloPlan,
    CieloPlanRate,
    CieloSubmissionStatus,
    cielo_plan_rate_keys,
)
from cielo.validators import validate_cnpj, validate_cpf
from quickportal.services.brasil_api import (
    BrasilApiError,
    fetch_cep_info,
    fetch_cnpj_registration,
)


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


DUPLICATE_PLAN_NAME_MESSAGE = "A plan with this name already exists for this business."
ARCHIVED_PLAN_MESSAGE = "An archived plan cannot be assigned to a new seller."


class CieloPlanRateSerializer(RejectUnknownFieldsSerializer, serializers.ModelSerializer):
    class Meta:
        model = CieloPlanRate
        fields = ["card_brand", "method", "installments", "mdr", "fixed_fee"]

    def validate(self, attrs):
        installments = attrs.get("installments")
        if attrs["method"] == CieloPaymentMethod.DEBIT and installments is not None:
            raise serializers.ValidationError(
                {"installments": ["A debit rate cannot have installments."]}
            )
        if attrs["method"] == CieloPaymentMethod.CREDIT and (
            installments is None
            or not 1 <= installments <= CIELO_PLAN_MAX_INSTALLMENTS
        ):
            raise serializers.ValidationError(
                {
                    "installments": [
                        "A credit rate must have between 1 and "
                        f"{CIELO_PLAN_MAX_INSTALLMENTS} installments."
                    ]
                }
            )
        return attrs


class CieloPlanSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = CieloPlan
        fields = [
            "id",
            "owner_business",
            "name",
            "description",
            "created_by",
            "created_at",
            "archived_at",
            "archived_by",
        ]
        read_only_fields = fields


class CieloPlanSerializer(RejectUnknownFieldsSerializer, serializers.ModelSerializer):
    """Creates a plan with all its rates; plans are never updated."""

    rates = CieloPlanRateSerializer(many=True)

    class Meta:
        model = CieloPlan
        fields = [*CieloPlanSummarySerializer.Meta.fields, "rates"]
        read_only_fields = [
            "id",
            "owner_business",
            "created_by",
            "created_at",
            "archived_at",
            "archived_by",
        ]

    def validate_rates(self, rates):
        keys = [
            (rate["card_brand"], rate["method"], rate.get("installments"))
            for rate in rates
        ]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Each rate may only appear once per plan.")
        expected_keys = cielo_plan_rate_keys()
        if set(keys) != set(expected_keys):
            raise serializers.ValidationError(
                f"A plan must include all {len(expected_keys)} rates."
            )
        return rates

    def validate(self, attrs):
        if CieloPlan.objects.filter(
            owner_business=self.context["owner_business"], name=attrs["name"]
        ).exists():
            raise serializers.ValidationError({"name": [DUPLICATE_PLAN_NAME_MESSAGE]})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        rates = validated_data.pop("rates")
        plan = CieloPlan(**validated_data)
        plan.save()
        # Store rates in their canonical order so reads list them consistently.
        order = {key: index for index, key in enumerate(cielo_plan_rate_keys())}
        plan_rates = sorted(
            (CieloPlanRate(plan=plan, **rate) for rate in rates),
            key=lambda rate: order[
                (rate.card_brand, rate.method, rate.installments)
            ],
        )
        for rate in plan_rates:
            rate.full_clean(validate_unique=False, validate_constraints=False)
        CieloPlanRate.objects.bulk_create(plan_rates)
        return plan


class CieloBusinessCreateSerializer(RejectUnknownFieldsSerializer):
    plan = serializers.PrimaryKeyRelatedField(queryset=CieloPlan.objects.none())
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

    def get_fields(self):
        fields = super().get_fields()
        # Plans of other businesses are reported as nonexistent.
        fields["plan"].queryset = CieloPlan.objects.filter(
            owner_business=self.context["plan_owner"]
        )
        return fields

    def validate_plan(self, plan):
        if plan.archived_at is not None:
            raise serializers.ValidationError(ARCHIVED_PLAN_MESSAGE)
        return plan

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
            cnpj_info = fetch_cnpj_registration(document_number)
            attrs["corporate_name"] = cnpj_info["name"]
            attrs["fancy_name"] = cnpj_info["trade_name"]
            attrs["birthday_date"] = None
            attrs["business_activity_id"] = None

        address = fetch_cep_info(attrs["address"]["zip_code"])
        managed_address = {
            "address_street": address.get("street"),
            "address_neighborhood": address.get("neighborhood"),
            "address_city": address.get("city"),
            "address_state": address.get("state"),
        }
        if any(
            not isinstance(value, str) or not value.strip()
            for value in managed_address.values()
        ):
            raise BrasilApiError(
                "Brasil API returned an incomplete address",
                status_code=200,
                resource="cep",
                reason="invalid_response",
            )
        if len(managed_address["address_state"]) != 2:
            raise BrasilApiError(
                "Brasil API returned an invalid state",
                status_code=200,
                resource="cep",
                reason="invalid_response",
            )
        attrs.update(managed_address)
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


class CieloNotificationStatusField(serializers.Field):
    """Serializes a Cielo status as ``{value, label}``, keeping unlisted values."""

    def __init__(self, choices_class, **kwargs):
        self.choices_class = choices_class
        kwargs["read_only"] = True
        super().__init__(**kwargs)

    def to_representation(self, value):
        try:
            label = self.choices_class(value).label
        except ValueError:
            label = f"Desconhecido ({value})"
        return {"value": value, "label": label}


class CieloBusinessSummarySerializer(serializers.ModelSerializer):
    retry_available_at = serializers.SerializerMethodField()
    can_retry = serializers.SerializerMethodField()
    kyc_status = CieloNotificationStatusField(CieloKycStatus)
    bank_account_status = CieloNotificationStatusField(CieloBankAccountStatus)
    onboarding_status = CieloNotificationStatusField(CieloOnboardingStatus)

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
            "kyc_status",
            "kyc_status_updated_at",
            "bank_account_status",
            "bank_account_status_updated_at",
            "onboarding_status",
            "onboarding_status_updated_at",
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
