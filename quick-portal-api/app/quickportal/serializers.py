import uuid
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from quickportal.models import (
    Acquirer, Business, BusinessColor, BusinessColorPreference, BusinessMembership,
    BusinessType, DocumentType, PosDevice, PosModel, RecurringFee,
    RecurringFeeTarget,
)
from quickportal.services.brasil_api import fetch_cnpj_info


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "email", "password"]

    def create(self, validated_data):
        username = f"user_{uuid.uuid4().hex[:12]}"

        if validated_data.get("email") is None:
            raise serializers.ValidationError({"email": "This field is required."})

        existing_email = User.objects.filter(
            email__iexact=validated_data["email"]
        ).exists()

        if existing_email:
            raise serializers.ValidationError(
                {"email": "Email address already exists."}
            )

        return User.objects.create_user(
            username=username,
            email=validated_data["email"],
            password=validated_data["password"],
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        password = attrs.get("password", "")

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {"email": "No account found with this email."}
            )

        # Authenticate using the real username under the hood
        credentials = {
            User.USERNAME_FIELD: user.username,
            "password": password,
        }
        authenticated_user = authenticate(**credentials)

        if authenticated_user is None:
            raise serializers.ValidationError({"password": "Incorrect password."})

        if not authenticated_user.is_active:
            raise serializers.ValidationError({"email": "This account is inactive."})

        # Let SimpleJWT build the token pair from here
        self.user = authenticated_user
        data = {}
        refresh = self.get_token(authenticated_user)
        data["refresh"] = str(refresh)
        data["access"] = str(refresh.access_token)
        return data


class AcquirerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Acquirer
        fields = ["id", "name"]


class PosModelSerializer(serializers.ModelSerializer):
    acquirer = AcquirerSerializer(read_only=True)

    class Meta:
        model = PosModel
        fields = ["id", "model", "acquirer"]


class BusinessWriteSerializer(serializers.ModelSerializer):
    name = serializers.CharField(required=False, allow_blank=False)
    trade_name = serializers.CharField(required=False, allow_blank=True, default="")
    landline = serializers.CharField(required=False, allow_blank=True, default="")
    class Meta:
        model = Business
        fields = [
            "type", "parent", "document_type", "document", "name", "trade_name",
            "email", "phone", "landline",
        ]

    @staticmethod
    def _validate_digits(value, field_name):
        if value and not value.isdigit():
            raise serializers.ValidationError(f"{field_name} must contain only digits.")
        return value

    def validate_document(self, value):
        return self._validate_digits(value, "document")

    def validate_phone(self, value):
        return self._validate_digits(value, "phone")

    def validate_landline(self, value):
        return self._validate_digits(value, "landline")

    def validate(self, attrs):
        """Validate and return business attribute mapping ``attrs``.

        The method enforces immutable document fields, hierarchy rules, and
        document-type-specific name management. It enriches new CNPJ records
        from BrasilAPI and raises ``serializers.ValidationError`` for invalid
        hierarchy, missing CPF names, or client-supplied managed CNPJ fields.
        """
        if self.instance is not None:
            immutable_errors = {}
            for field in ("document", "document_type"):
                if field in self.initial_data and self.initial_data[field] != getattr(self.instance, field):
                    immutable_errors[field] = "This field cannot be changed after creation."
            if immutable_errors:
                raise serializers.ValidationError(immutable_errors)

        document_type = attrs.get("document_type") or getattr(self.instance, "document_type", None)
        business_type = attrs.get("type") or getattr(self.instance, "type", None)
        parent = attrs.get("parent", getattr(self.instance, "parent", None))

        if self.instance is not None and parent == self.instance:
            raise serializers.ValidationError(
                {"parent": "A business cannot be its own parent."}
            )
        if business_type == BusinessType.RESELLER and parent is not None:
            raise serializers.ValidationError(
                {"parent": "A reseller must be a root business."}
            )
        if business_type == BusinessType.RE_RESELLER:
            if parent is None or parent.type != BusinessType.RESELLER:
                raise serializers.ValidationError(
                    {"parent": "A re-reseller must belong to a reseller."}
                )
        if (
            business_type == BusinessType.STORE
            and parent is not None
            and parent.type not in {BusinessType.RESELLER, BusinessType.RE_RESELLER}
        ):
            raise serializers.ValidationError(
                {"parent": "A store may only belong to a reseller or re-reseller."}
            )
        if self.instance is not None and business_type != self.instance.type:
            allowed_children = {
                BusinessType.RESELLER: {
                    BusinessType.RE_RESELLER,
                    BusinessType.STORE,
                },
                BusinessType.RE_RESELLER: {BusinessType.STORE},
                BusinessType.STORE: set(),
            }[business_type]
            if self.instance.children.exclude(type__in=allowed_children).exists():
                raise serializers.ValidationError(
                    {"type": "The new type is incompatible with existing children."}
                )

        if document_type == DocumentType.CPF:
            errors = {}
            if not attrs.get("name") and not getattr(self.instance, "name", None):
                errors["name"] = "This field is required when document_type is CPF."
            if errors:
                raise serializers.ValidationError(errors)
        elif document_type == DocumentType.CNPJ:
            managed_fields = ("name", "trade_name")
            conflicting = [f for f in managed_fields if f in self.initial_data]
            if conflicting:
                raise serializers.ValidationError({
                    f: "This field is auto-populated for CNPJ and must not be provided."
                    for f in conflicting
                })
            document = attrs.get("document") or getattr(self.instance, "document", None)
            if document and self.instance is None:
                info = fetch_cnpj_info(document)
                attrs["trade_name"] = info["trade_name"]
                attrs["name"] = info["name"]

        return attrs


class BusinessReadSerializer(serializers.ModelSerializer):
    color = serializers.SerializerMethodField()

    def get_color(self, business):
        """Return the requesting user's color for ``business``.

        ``business`` is the object currently being serialized. The optional
        ``request`` context identifies the user, while ``business_ids`` limits
        preference loading to the list or detail objects being serialized.
        The resulting ID-to-color mapping is cached in the shared
        ``business_colors`` serializer context. ``BusinessColor.BLUE`` is
        returned when there is no request or no preference for this business.
        """
        request = self.context.get("request")
        if request is None:
            return BusinessColor.BLUE
        colors = self.context.get("business_colors")
        if colors is None:
            business_ids = self.context.get("business_ids")
            if business_ids is None:
                instances = getattr(self.parent, "instance", None)
                business_ids = (
                    [item.id for item in instances]
                    if instances is not None
                    else [business.id]
                )
            colors = dict(
                BusinessColorPreference.objects.filter(
                    user=request.user,
                    business_id__in=business_ids,
                )
                .values_list("business_id", "color")
            )
            self.context["business_colors"] = colors
        return colors.get(business.id, BusinessColor.BLUE)

    class Meta:
        model = Business
        fields = [
            "id", "type", "parent", "document_type", "document", "name",
            "trade_name", "email", "phone", "landline",
            "color",
        ]


class BusinessColorPreferenceSerializer(serializers.Serializer):
    color = serializers.ChoiceField(choices=BusinessColor.choices)


class RecurringFeeBusinessSerializer(serializers.ModelSerializer):
    class Meta:
        model = Business
        fields = ["id", "type", "name", "trade_name", "document"]


class RecurringFeeSerializer(serializers.ModelSerializer):
    targets = serializers.PrimaryKeyRelatedField(
        queryset=Business.objects.all(), many=True, write_only=True
    )
    target_businesses = RecurringFeeBusinessSerializer(
        source="targets", many=True, read_only=True
    )
    owner = RecurringFeeBusinessSerializer(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = RecurringFee
        fields = [
            "id",
            "owner",
            "name",
            "description",
            "setup_value",
            "pricing_mode",
            "fee_value",
            "goal_amount",
            "value_below_goal",
            "value_at_or_above_goal",
            "recurrence_unit",
            "recurrence_interval",
            "charge_rule",
            "charge_weekday",
            "charge_day",
            "charge_month",
            "business_day_ordinal",
            "start_date",
            "end_date",
            "active",
            "targets",
            "target_businesses",
            "created_at",
            "created_by",
        ]
        read_only_fields = ["id", "owner", "created_at", "created_by"]

    def validate_targets(self, targets):
        owner = self.context["owner"]
        target_ids = [target.pk for target in targets]
        if not targets:
            raise serializers.ValidationError("Select at least one target business.")
        if len(target_ids) != len(set(target_ids)):
            raise serializers.ValidationError("Target businesses must be unique.")
        invalid = [target.pk for target in targets if target.parent_id != owner.pk]
        if invalid:
            raise serializers.ValidationError(
                "Targets must be direct children of the owner business."
            )
        return targets

    def validate(self, attrs):
        attrs = super().validate(attrs)
        model_values = {
            field.name: getattr(self.instance, field.name)
            for field in RecurringFee._meta.fields
            if self.instance is not None and field.name != "id"
        }
        model_values.update({key: value for key, value in attrs.items() if key != "targets"})
        model_values.setdefault("owner", self.context["owner"])
        model_values.setdefault("created_by", self.context["request"].user)
        candidate = RecurringFee(**model_values)
        try:
            candidate.clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        targets = validated_data.pop("targets")
        recurring_fee = RecurringFee(
            owner=self.context["owner"],
            created_by=self.context["request"].user,
            **validated_data,
        )
        recurring_fee.full_clean()
        recurring_fee.save()
        for target in targets:
            link = RecurringFeeTarget(recurring_fee=recurring_fee, target=target)
            link.full_clean()
            link.save()
        return recurring_fee

    @transaction.atomic
    def update(self, instance, validated_data):
        targets = validated_data.pop("targets", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save()
        if targets is not None:
            target_ids = {target.pk for target in targets}
            instance.target_links.exclude(target_id__in=target_ids).delete()
            for target in targets:
                RecurringFeeTarget.objects.get_or_create(
                    recurring_fee=instance,
                    target=target,
                )
            instance._prefetched_objects_cache = {}
        return instance


class BusinessMembershipReadSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = BusinessMembership
        fields = ["id", "user", "email", "business", "role"]


class BusinessMembershipWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessMembership
        fields = ["user", "role"]

    def validate(self, attrs):
        user = attrs.get("user", getattr(self.instance, "user", None))
        if (
            self.instance is not None
            and "user" in attrs
            and user != self.instance.user
        ):
            raise serializers.ValidationError(
                {"user": "The user on a membership cannot be changed."}
            )
        business = self.context.get("business")
        if self.instance is None and business is not None:
            if BusinessMembership.objects.filter(
                user=user, business=business
            ).exists():
                raise serializers.ValidationError(
                    {"user": "This user already belongs to this business."}
                )
        return attrs


class PosDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PosDevice
        fields = ["id", "model", "serial", "business"]

    def validate_business(self, value):
        if value.type != BusinessType.STORE:
            raise serializers.ValidationError(
                "POS devices can only be assigned to a store."
            )
        return value
