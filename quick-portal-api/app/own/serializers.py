import base64
from collections.abc import Mapping
from pathlib import Path
import re

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from rest_framework import serializers

from django.db import transaction

from own.models import (
    OwnActivity,
    OwnBasket,
    OwnBusiness,
    OwnBusinessAttachment,
    OwnBusinessAttachmentType,
    OwnBusinessPartner,
    OwnFee,
    OwnPlan,
    OwnPlanFee,
    OwnPartnerAttachment,
    OwnPartnerAttachmentType,
)
from quickportal.services.brasil_api import fetch_cep_info
from own.validators import validate_cpf
from quickportal.models import BusinessType


MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_ATTACHMENT_COUNT = 50
MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024
BASE64_PATTERN = re.compile(r"^[A-Za-z0-9+/]*={0,2}$")


def _decoded_size(value):
    """Return decoded byte size for Base64 string ``value`` as an integer."""
    return (len(value) * 3 // 4) - len(value) + len(value.rstrip("="))


class OwnAttachmentInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    content = serializers.CharField(write_only=True)

    def validate_name(self, value):
        """Validate client file-name ``value`` and return its path-free basename."""
        name = Path(value.replace("\\", "/")).name
        if not name or name in {".", ".."}:
            raise serializers.ValidationError("Enter a valid file name.")
        return name

    def validate_content(self, value):
        """Validate Base64 string ``value`` and return it without decoding."""
        if len(value) % 4 or not BASE64_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Enter valid Base64-encoded file content."
            )
        decoded_size = _decoded_size(value)
        if decoded_size <= 0:
            raise serializers.ValidationError("The attachment cannot be empty.")
        if decoded_size > MAX_ATTACHMENT_BYTES:
            raise serializers.ValidationError("Attachments cannot exceed 10 MB.")
        return value


class OwnPartnerAttachmentInputSerializer(OwnAttachmentInputSerializer):
    type = serializers.ChoiceField(choices=OwnPartnerAttachmentType.choices)


class OwnBusinessAttachmentInputSerializer(OwnAttachmentInputSerializer):
    type = serializers.ChoiceField(choices=OwnBusinessAttachmentType.choices)


class OwnBusinessPartnerInputSerializer(serializers.Serializer):
    cpf = serializers.RegexField(r"^\d{11}\Z", validators=[validate_cpf])
    attachments = OwnPartnerAttachmentInputSerializer(many=True, allow_empty=False)


class OwnStoredAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OwnBusinessAttachment
        fields = ["id", "original_name", "type"]


class OwnStoredPartnerAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OwnPartnerAttachment
        fields = ["id", "original_name", "type"]


class OwnBusinessPartnerReadSerializer(serializers.ModelSerializer):
    attachments = OwnStoredPartnerAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = OwnBusinessPartner
        fields = ["id", "cpf", "attachments"]


class OwnBusinessSignupSerializer(serializers.ModelSerializer):
    business = serializers.PrimaryKeyRelatedField(read_only=True)
    cnae = serializers.IntegerField(source="plan.activity_id", read_only=True)
    partners = OwnBusinessPartnerInputSerializer(
        many=True,
        allow_empty=True,
        required=False,
        default=list,
        write_only=True,
    )
    attachments = OwnBusinessAttachmentInputSerializer(
        many=True,
        allow_empty=True,
        required=False,
        default=list,
        write_only=True,
    )
    partner_documents = OwnBusinessPartnerReadSerializer(
        source="partners",
        many=True,
        read_only=True,
    )
    stored_attachments = OwnStoredAttachmentSerializer(
        source="attachments",
        many=True,
        read_only=True,
    )
    street = serializers.CharField(read_only=True)
    neighborhood = serializers.CharField(read_only=True)
    city = serializers.CharField(read_only=True)
    state = serializers.CharField(read_only=True)

    class Meta:
        model = OwnBusiness
        fields = [
            "id",
            "business",
            "cnae",
            "plan",
            "signatory_name",
            "signatory_cpf",
            "signatory_email",
            "forecast_revenue",
            "contract_revenue",
            "postal_code",
            "street",
            "address_number",
            "address_complement",
            "neighborhood",
            "city",
            "state",
            "pos_quantity",
            "bank_code",
            "bank_branch",
            "bank_branch_digit",
            "bank_account",
            "bank_account_digit",
            "core_protocol",
            "contract_number",
            "registration_status",
            "registration_error",
            "partners",
            "attachments",
            "partner_documents",
            "stored_attachments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "core_protocol",
            "contract_number",
            "registration_status",
            "registration_error",
            "created_at",
            "updated_at",
        ]

    def validate_plan(self, plan):
        business = self.context.get("business") or getattr(self.instance, "business", None)
        if business is not None and plan.owner_business_id is not None:
            expected_owner_id = (
                business.parent_id
                if business.type == BusinessType.STORE
                else business.parent_id or business.pk
            )
            if plan.owner_business_id != expected_owner_id:
                raise serializers.ValidationError(
                    "The plan does not belong to this business scope."
                )
        return plan

    def to_internal_value(self, data):
        """Preflight raw request ``data`` and return DRF's validated mapping."""
        if not isinstance(data, Mapping):
            return super().to_internal_value(data)
        business_attachments = data.get("attachments")
        partners = data.get("partners")
        raw_attachments = (
            list(business_attachments)
            if isinstance(business_attachments, list)
            else []
        )
        if isinstance(partners, list):
            for partner in partners:
                if not isinstance(partner, Mapping):
                    continue
                partner_attachments = partner.get("attachments")
                if isinstance(partner_attachments, list):
                    raw_attachments.extend(partner_attachments)
        attachments = [
            attachment
            for attachment in raw_attachments
            if isinstance(attachment, Mapping)
        ]
        if len(attachments) > MAX_ATTACHMENT_COUNT:
            raise serializers.ValidationError(
                {"attachments": f"A signup cannot contain more than {MAX_ATTACHMENT_COUNT} files."}
            )
        encoded_length = sum(
            len(content)
            for attachment in attachments
            if isinstance((content := attachment.get("content")), str)
        )
        max_encoded_length = 4 * ((MAX_TOTAL_ATTACHMENT_BYTES + 2) // 3)
        if encoded_length > max_encoded_length:
            raise serializers.ValidationError(
                {"attachments": f"Combined attachments cannot exceed {MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024):g} MB."}
            )
        return super().to_internal_value(data)

    def validate_partners(self, value):
        """Validate partner list ``value`` and return it without repeated CPFs."""
        cpfs = [partner["cpf"] for partner in value]
        if len(cpfs) != len(set(cpfs)):
            raise serializers.ValidationError(
                "Each partner CPF may only appear once."
            )
        return value

    def validate(self, attrs):
        """Validate signup mapping ``attrs`` and return it with managed address data."""
        all_attachments = list(attrs["attachments"])
        all_attachments.extend(
            attachment
            for partner in attrs["partners"]
            for attachment in partner["attachments"]
        )
        if len(all_attachments) > MAX_ATTACHMENT_COUNT:
            raise serializers.ValidationError(
                {"attachments": f"A signup cannot contain more than {MAX_ATTACHMENT_COUNT} files."}
            )
        total_size = sum(
            _decoded_size(attachment["content"])
            for attachment in all_attachments
        )
        if total_size > MAX_TOTAL_ATTACHMENT_BYTES:
            raise serializers.ValidationError(
                {"attachments": f"Combined attachments cannot exceed {MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024):g} MB."}
            )
        address = fetch_cep_info(attrs["postal_code"])
        attrs.update(
            street=address.get("street") or "",
            neighborhood=address.get("neighborhood") or "",
            city=address.get("city") or "",
            state=(address.get("state") or "").upper(),
        )
        missing = [
            field
            for field in ("street", "neighborhood", "city", "state")
            if not attrs[field]
        ]
        if missing:
            raise serializers.ValidationError(
                {"postal_code": "The ZIP code returned an incomplete address."}
            )
        return attrs

    def create(self, validated_data):
        """Persist signup mapping ``validated_data`` and return its OwnBusiness."""
        partners = validated_data.pop("partners")
        attachments = validated_data.pop("attachments")
        own_business = OwnBusiness(**validated_data)
        own_business.full_clean()
        own_business.save()
        self._stored_file_names = []
        for partner_data in partners:
            partner_attachments = partner_data.pop("attachments")
            partner = OwnBusinessPartner(
                own_business=own_business,
                **partner_data,
            )
            partner.full_clean()
            partner.save()
            for attachment in partner_attachments:
                self._create_attachment(
                    OwnPartnerAttachment,
                    attachment,
                    partner=partner,
                )
        for attachment in attachments:
            self._create_attachment(
                OwnBusinessAttachment,
                attachment,
                own_business=own_business,
            )
        return own_business

    def _create_attachment(self, model, data, **relation):
        """Persist attachment ``data`` with ``model`` and parent ``relation``."""
        content = base64.b64decode(data.pop("content"), validate=True)
        name = data.pop("name")
        attachment = model(
            **relation,
            **data,
            original_name=name,
            file=ContentFile(content, name=name),
        )
        try:
            attachment.full_clean()
            attachment.save()
        finally:
            if attachment.file and attachment.file._committed:
                self._stored_file_names.append(attachment.file.name)

    def cleanup_files(self):
        """Delete this serializer's stored files and return ``None``."""
        for name in getattr(self, "_stored_file_names", []):
            default_storage.delete(name)


class OwnBusinessUpdateSerializer(OwnBusinessSignupSerializer):
    """Partially update a failed OWN signup before it is submitted again."""

    def validate(self, attrs):
        """Validate changed values against the persisted signup state."""
        partners = attrs.get("partners", serializers.empty)
        attachments = attrs.get("attachments", serializers.empty)
        final_attachments = []
        if attachments is not serializers.empty:
            final_attachments.extend(attachments)
        else:
            final_attachments.extend(self.instance.attachments.all())
        if partners is not serializers.empty:
            final_attachments.extend(
                attachment
                for partner in partners
                for attachment in partner["attachments"]
            )
        else:
            final_attachments.extend(
                attachment
                for partner in self.instance.partners.all()
                for attachment in partner.attachments.all()
            )
        if len(final_attachments) > MAX_ATTACHMENT_COUNT:
            raise serializers.ValidationError(
                {"attachments": f"A signup cannot contain more than {MAX_ATTACHMENT_COUNT} files."}
            )
        total_size = sum(
            _decoded_size(attachment["content"])
            if isinstance(attachment, Mapping)
            else attachment.file.size
            for attachment in final_attachments
        )
        if total_size > MAX_TOTAL_ATTACHMENT_BYTES:
            raise serializers.ValidationError(
                {"attachments": f"Combined attachments cannot exceed {MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024):g} MB."}
            )

        if "postal_code" in attrs:
            address = fetch_cep_info(attrs["postal_code"])
            attrs.update(
                street=address.get("street") or "",
                neighborhood=address.get("neighborhood") or "",
                city=address.get("city") or "",
                state=(address.get("state") or "").upper(),
            )
            missing = [
                field
                for field in ("street", "neighborhood", "city", "state")
                if not attrs[field]
            ]
            if missing:
                raise serializers.ValidationError(
                    {"postal_code": "The ZIP code returned an incomplete address."}
                )
        return attrs

    def update(self, instance, validated_data):
        """Persist changed signup values and replace supplied document collections."""
        partners = validated_data.pop("partners", serializers.empty)
        attachments = validated_data.pop("attachments", serializers.empty)
        old_file_names = []
        self._stored_file_names = []
        try:
            with transaction.atomic():
                for field, value in validated_data.items():
                    setattr(instance, field, value)
                instance.full_clean()
                instance.save()

                if partners is not serializers.empty:
                    old_file_names.extend(
                        OwnPartnerAttachment.objects.filter(
                            partner__own_business=instance
                        ).values_list("file", flat=True)
                    )
                    instance.partners.all().delete()
                    for partner_data in partners:
                        partner_attachments = partner_data.pop("attachments")
                        partner = OwnBusinessPartner(
                            own_business=instance,
                            **partner_data,
                        )
                        partner.full_clean()
                        partner.save()
                        for attachment in partner_attachments:
                            self._create_attachment(
                                OwnPartnerAttachment,
                                attachment,
                                partner=partner,
                            )

                if attachments is not serializers.empty:
                    old_file_names.extend(
                        instance.attachments.values_list("file", flat=True)
                    )
                    instance.attachments.all().delete()
                    for attachment in attachments:
                        self._create_attachment(
                            OwnBusinessAttachment,
                            attachment,
                            own_business=instance,
                        )
        except Exception:
            self.cleanup_files()
            raise

        for name in old_file_names:
            default_storage.delete(name)
        instance._prefetched_objects_cache = {}
        return instance


class OwnReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ["id", "name"]


class OwnBasketSerializer(OwnReferenceSerializer):
    class Meta(OwnReferenceSerializer.Meta):
        model = OwnBasket
        fields = ["id", "name", "anticipation_fee", "fee_amount"]


class OwnFeeSerializer(serializers.ModelSerializer):

    class Meta:
        model = OwnFee
        fields = [
            "id",
            "basketId",
            "value",
            "baseMdr",
            "network",
            "channel",
            "method",
            "installment",
            "upperInstallment",
        ]


class OwnActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = OwnActivity
        fields = ["cnae", "description", "mcc"]


class OwnPlanFeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OwnPlanFee
        fields = ["fee", "value"]


class OwnPlanSerializer(serializers.ModelSerializer):
    fees = OwnPlanFeeSerializer(many=True)

    class Meta:
        model = OwnPlan
        fields = [
            "id",
            "owner_business",
            "created_by",
            "created_at",
            "updated_by",
            "updated_at",
            "title",
            "description",
            "anticipation_type",
            "activity",
            "basketId",
            "fees",
        ]
        read_only_fields = [
            "id", "owner_business", "created_by", "created_at", "updated_by", "updated_at"
        ]

    def validate_fees(self, fees):
        """Validate that ``fees`` contains each OWN fee at most once.

        Returns the unchanged nested fee data. A DRF ``ValidationError`` is
        raised when duplicate fee primary keys are present.
        """
        fee_ids = [item["fee"].pk for item in fees]
        if len(fee_ids) != len(set(fee_ids)):
            raise serializers.ValidationError("A fee may only appear once per plan.")
        return fees

    def validate(self, attrs):
        """Require plan fees to belong to the selected basket."""
        attrs = super().validate(attrs)
        basket = attrs.get(
            "basketId", self.instance.basketId if self.instance else None
        )
        fees = attrs.get("fees")
        if basket is None or fees is None:
            return attrs

        errors = {}
        for index, plan_fee in enumerate(fees):
            fee = plan_fee["fee"]
            if fee.basketId_id != basket.pk:
                errors[index] = "The fee must belong to the selected basket."
        if errors:
            raise serializers.ValidationError({"fees": errors})
        if self.instance is None and len(fees) < basket.fee_amount:
            raise serializers.ValidationError(
                {
                    "fees": (
                        f"A plan for this basket must include at least "
                        f"{basket.fee_amount} fee entries."
                    )
                }
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        """Create and validate a plan plus its nested fee rows atomically.

        ``validated_data`` contains plan fields and the required ``fees`` list.
        Returns the saved ``OwnPlan`` instance. Model validation runs before
        the plan is persisted.
        """
        fees = validated_data.pop("fees")
        plan = OwnPlan(**validated_data)
        plan.full_clean()
        plan.save()
        OwnPlanFee.objects.bulk_create(
            OwnPlanFee(plan=plan, **fee) for fee in fees
        )
        return plan

    @transaction.atomic
    def update(self, instance, validated_data):
        """Validate and update ``instance`` and optionally replace nested fees.

        ``validated_data`` contains changed plan fields and may contain ``fees``.
        Returns the saved plan. When fees are supplied, all existing nested fee
        rows are replaced atomically after model validation succeeds.
        """
        fees = validated_data.pop("fees", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save()
        if fees is not None:
            instance.fees.all().delete()
            OwnPlanFee.objects.bulk_create(
                OwnPlanFee(plan=instance, **fee) for fee in fees
            )
        return instance
