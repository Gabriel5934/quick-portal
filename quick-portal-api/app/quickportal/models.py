
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q
from django.core.validators import MinValueValidator, RegexValidator


digits_only = RegexValidator(r"^\d+$", "This field must contain only digits.")


class DocumentType(models.TextChoices):
    CPF = "CPF"
    CNPJ = "CNPJ"



class BusinessType(models.TextChoices):
    RESELLER = "RESELLER", "Reseller"
    RE_RESELLER = "RE_RESELLER", "Re-reseller"
    STORE = "STORE", "Store"


class BusinessRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    MANAGER = "MANAGER", "Manager"
    VIEWER = "VIEWER", "Viewer"


class BusinessColor(models.TextChoices):
    BLUE = "blue", "Blue"
    GREEN = "green", "Green"
    YELLOW = "yellow", "Yellow"
    PURPLE = "purple", "Purple"
    ORANGE = "orange", "Orange"


class RecurringFeePricingMode(models.TextChoices):
    FIXED = "FIXED", "Fixed"
    GOAL = "GOAL", "Goal-based"


class RecurrenceUnit(models.TextChoices):
    DAY = "DAY", "Day"
    WEEK = "WEEK", "Week"
    MONTH = "MONTH", "Month"
    YEAR = "YEAR", "Year"


class ChargeRule(models.TextChoices):
    INTERVAL = "INTERVAL", "Interval"
    WEEKDAY = "WEEKDAY", "Weekday"
    DAY_OF_MONTH = "DAY_OF_MONTH", "Day of month"
    BUSINESS_DAY_OF_MONTH = "BUSINESS_DAY_OF_MONTH", "Business day of month"
    DATE_OF_YEAR = "DATE_OF_YEAR", "Date of year"


class Business(models.Model):
    type = models.CharField(max_length=20, choices=BusinessType.choices)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="children",
        null=True,
        blank=True,
    )
    document_type = models.CharField(max_length=4, choices=DocumentType.choices)
    document = models.CharField(max_length=20)
    name = models.CharField(max_length=200)
    trade_name = models.CharField(max_length=200, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    landline = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "business"
        constraints = [
            models.CheckConstraint(
                condition=Q(parent__isnull=True) | ~Q(parent=F("id")),
                name="business_parent_not_self",
            )
        ]

    def clean(self):
        super().clean()
        if self.parent_id == self.pk and self.pk is not None:
            raise ValidationError({"parent": "A business cannot be its own parent."})
        if self.type == BusinessType.RESELLER and self.parent_id is not None:
            raise ValidationError({"parent": "A reseller must be a root business."})
        if self.type == BusinessType.RE_RESELLER:
            if self.parent_id is None or self.parent.type != BusinessType.RESELLER:
                raise ValidationError(
                    {"parent": "A re-reseller must belong to a reseller."}
                )
        if (
            self.type == BusinessType.STORE
            and self.parent_id is not None
            and self.parent.type
            not in {BusinessType.RESELLER, BusinessType.RE_RESELLER}
        ):
            raise ValidationError(
                {"parent": "A store may only belong to a reseller or re-reseller."}
            )
        if self.pk is not None:
            allowed_children = {
                BusinessType.RESELLER: {
                    BusinessType.RE_RESELLER,
                    BusinessType.STORE,
                },
                BusinessType.RE_RESELLER: {BusinessType.STORE},
                BusinessType.STORE: set(),
            }.get(self.type, set())
            if self.children.exclude(type__in=allowed_children).exists():
                raise ValidationError(
                    {"type": "This type is incompatible with existing children."}
                )

    def __str__(self):
        return self.name


class BusinessMembership(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="business_memberships",
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=20, choices=BusinessRole.choices)

    class Meta:
        db_table = "business_membership"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "business"],
                name="unique_user_business_membership",
            )
        ]

    def __str__(self):
        return f"{self.user_id} / {self.business_id} / {self.role}"


class BusinessColorPreference(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="business_color_preferences",
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name="color_preferences",
    )
    color = models.CharField(
        max_length=10,
        choices=BusinessColor.choices,
        default=BusinessColor.BLUE,
    )

    class Meta:
        db_table = "business_color_preference"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "business"],
                name="unique_user_business_color_preference",
            )
        ]

    def save(self, *args, **kwargs):
        """Validate and persist this preference.

        ``*args`` and ``**kwargs`` are forwarded to Django's model ``save``.
        Returns the value returned by the parent ``save`` implementation.
        """
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        """Return this preference's user, business, and color display string.

        ``self`` is the preference being displayed. The result has the form
        ``user_id / business_id / color``.
        """
        return f"{self.user_id} / {self.business_id} / {self.color}"


class RecurringFee(models.Model):
    owner = models.ForeignKey(
        Business, on_delete=models.PROTECT, related_name="owned_recurring_fees"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    setup_value = models.DecimalField(
        max_digits=15, decimal_places=2, validators=[MinValueValidator(0)]
    )
    pricing_mode = models.CharField(
        max_length=10, choices=RecurringFeePricingMode.choices
    )
    fee_value = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True,
    )
    goal_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True,
    )
    value_below_goal = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True,
    )
    value_at_or_above_goal = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        null=True,
        blank=True,
    )
    recurrence_unit = models.CharField(max_length=10, choices=RecurrenceUnit.choices)
    recurrence_interval = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1)]
    )
    charge_rule = models.CharField(max_length=30, choices=ChargeRule.choices)
    charge_weekday = models.PositiveSmallIntegerField(null=True, blank=True)
    charge_day = models.PositiveSmallIntegerField(null=True, blank=True)
    charge_month = models.PositiveSmallIntegerField(null=True, blank=True)
    business_day_ordinal = models.PositiveSmallIntegerField(null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_recurring_fees",
    )
    targets = models.ManyToManyField(
        Business,
        through="RecurringFeeTarget",
        related_name="targeted_recurring_fees",
    )

    class Meta:
        db_table = "recurring_fee"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(recurrence_interval__gte=1),
                name="recurring_fee_positive_interval",
            ),
            models.CheckConstraint(
                condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")),
                name="recurring_fee_valid_dates",
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        errors = {}

        if self.recurrence_interval is not None and self.recurrence_interval < 1:
            errors["recurrence_interval"] = "Use a recurrence interval of at least 1."

        if self.pricing_mode == RecurringFeePricingMode.FIXED:
            if self.fee_value is None:
                errors["fee_value"] = "This field is required for fixed pricing."
            for field in ("goal_amount", "value_below_goal", "value_at_or_above_goal"):
                if getattr(self, field) is not None:
                    errors[field] = "This field must be empty for fixed pricing."
        elif self.pricing_mode == RecurringFeePricingMode.GOAL:
            for field in ("goal_amount", "value_below_goal", "value_at_or_above_goal"):
                if getattr(self, field) is None:
                    errors[field] = "This field is required for goal-based pricing."
            if self.fee_value is not None:
                errors["fee_value"] = "This field must be empty for goal-based pricing."

        schedule_contract = {
            RecurrenceUnit.DAY: (ChargeRule.INTERVAL, ()),
            RecurrenceUnit.WEEK: (ChargeRule.WEEKDAY, ("charge_weekday",)),
            RecurrenceUnit.MONTH: (
                {ChargeRule.DAY_OF_MONTH, ChargeRule.BUSINESS_DAY_OF_MONTH},
                (),
            ),
            RecurrenceUnit.YEAR: (
                {ChargeRule.DATE_OF_YEAR, ChargeRule.BUSINESS_DAY_OF_MONTH},
                ("charge_month",),
            ),
        }
        expected_rule, base_required = schedule_contract.get(
            self.recurrence_unit, (set(), ())
        )
        valid_rules = expected_rule if isinstance(expected_rule, set) else {expected_rule}
        if self.charge_rule not in valid_rules:
            errors["charge_rule"] = "This charge rule is invalid for the recurrence unit."
        required = list(base_required)
        if self.charge_rule in {ChargeRule.DAY_OF_MONTH, ChargeRule.DATE_OF_YEAR}:
            required.append("charge_day")
        if self.charge_rule == ChargeRule.BUSINESS_DAY_OF_MONTH:
            required.append("business_day_ordinal")
        for field in required:
            if getattr(self, field) is None:
                errors[field] = "This field is required for the selected charge rule."

        if self.charge_weekday is not None and not 1 <= self.charge_weekday <= 7:
            errors["charge_weekday"] = "Use an ISO weekday from 1 to 7."
        if self.charge_day is not None and not 1 <= self.charge_day <= 31:
            errors["charge_day"] = "Use a day from 1 to 31."
        if self.charge_month is not None and not 1 <= self.charge_month <= 12:
            errors["charge_month"] = "Use a month from 1 to 12."
        if self.business_day_ordinal is not None and self.business_day_ordinal < 1:
            errors["business_day_ordinal"] = "Use a positive business-day ordinal."
        if self.end_date and self.start_date and self.end_date < self.start_date:
            errors["end_date"] = "End date must be on or after start date."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class RecurringFeeTarget(models.Model):
    recurring_fee = models.ForeignKey(
        RecurringFee, on_delete=models.CASCADE, related_name="target_links"
    )
    target = models.ForeignKey(
        Business, on_delete=models.PROTECT, related_name="recurring_fee_links"
    )
    setup_charged_at = models.DateTimeField(null=True, blank=True)
    next_charge_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "recurring_fee_target"
        constraints = [
            models.UniqueConstraint(
                fields=["recurring_fee", "target"],
                name="unique_recurring_fee_target",
            )
        ]

    def __str__(self):
        return f"{self.recurring_fee_id} / {self.target_id}"
