from rest_framework import serializers

from django.db import transaction

from own.models import (
    OwnActivity,
    OwnBasket,
    OwnChannel,
    OwnFee,
    OwnMethod,
    OwnNetwork,
    OwnPlan,
    OwnPlanFee,
)


class OwnReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ["id", "name"]


class OwnNetworkSerializer(OwnReferenceSerializer):
    class Meta(OwnReferenceSerializer.Meta):
        model = OwnNetwork


class OwnChannelSerializer(OwnReferenceSerializer):
    class Meta(OwnReferenceSerializer.Meta):
        model = OwnChannel


class OwnMethodSerializer(OwnReferenceSerializer):
    class Meta(OwnReferenceSerializer.Meta):
        model = OwnMethod


class OwnBasketSerializer(OwnReferenceSerializer):
    class Meta(OwnReferenceSerializer.Meta):
        model = OwnBasket


class OwnFeeSerializer(serializers.ModelSerializer):
    network = OwnNetworkSerializer(read_only=True)
    channel = OwnChannelSerializer(read_only=True)
    method = OwnMethodSerializer(read_only=True)

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
            "id", "created_by", "created_at", "updated_by", "updated_at"
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
