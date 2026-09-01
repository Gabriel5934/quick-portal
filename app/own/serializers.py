from rest_framework import serializers

from own.models import OwnChannel, OwnFee, OwnMethod, OwnNetwork


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


class OwnFeeSerializer(serializers.ModelSerializer):
    network = OwnNetworkSerializer(read_only=True)
    channel = OwnChannelSerializer(read_only=True)
    method = OwnMethodSerializer(read_only=True)

    class Meta:
        model = OwnFee
        fields = [
            "id",
            "basketId",
            "basketName",
            "value",
            "baseMdr",
            "network",
            "channel",
            "method",
            "installment",
            "upperInstallment",
        ]
