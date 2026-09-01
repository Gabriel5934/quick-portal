from django.db import models
from django.conf import settings


class OwnAnticipationType(models.TextChoices):
    NONE = "None", "None"
    ROTATING = "Rotating", "Rotating"


class OwnNetwork(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "own_network"
        ordering = ["id"]

    def __str__(self):
        """Return the network name used to display ``self``."""
        return self.name


class OwnChannel(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "own_channels"
        ordering = ["id"]

    def __str__(self):
        """Return the channel name used to display ``self``."""
        return self.name


class OwnMethod(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "own_methods"
        ordering = ["id"]

    def __str__(self):
        """Return the payment-method name used to display ``self``."""
        return self.name


class OwnBasket(models.Model):
    id = models.IntegerField(primary_key=True)
    name = models.CharField(max_length=20, unique=True)

    class Meta:
        db_table = "own_baskets"
        ordering = ["id"]

    def __str__(self):
        """Return the basket name used to display ``self``."""
        return self.name


class OwnFee(models.Model):
    id = models.BigIntegerField(primary_key=True)
    basketId = models.ForeignKey(
        OwnBasket,
        db_column="basketId",
        on_delete=models.PROTECT,
        related_name="fees",
    )
    value = models.DecimalField(max_digits=20, decimal_places=10)
    baseMdr = models.DecimalField(max_digits=20, decimal_places=10)
    network = models.ForeignKey(
        OwnNetwork,
        on_delete=models.PROTECT,
        related_name="fees",
        null=True,
        blank=True,
    )
    channel = models.ForeignKey(
        OwnChannel,
        on_delete=models.PROTECT,
        related_name="fees",
        null=True,
        blank=True,
    )
    method = models.ForeignKey(
        OwnMethod,
        on_delete=models.PROTECT,
        related_name="fees",
    )
    installment = models.IntegerField(null=True, blank=True)
    upperInstallment = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "own_fees"
        ordering = ["id"]

    def __str__(self):
        """Return ``basket / method / id`` as the display string for ``self``."""
        return f"{self.basketId} / {self.method} / {self.id}"


class OwnActivity(models.Model):
    cnae = models.CharField(max_length=20, primary_key=True)
    description = models.TextField()
    mcc = models.IntegerField()

    class Meta:
        db_table = "own_activities"
        ordering = ["cnae"]

    def __str__(self):
        """Return ``cnae - description`` as the display string for ``self``."""
        return f"{self.cnae} - {self.description}"


class OwnPlan(models.Model):
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_own_plans",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="updated_own_plans",
    )
    updated_at = models.DateTimeField(auto_now=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    anticipation_type = models.CharField(
        max_length=20,
        choices=OwnAnticipationType.choices,
        default=OwnAnticipationType.NONE,
    )
    activity = models.ForeignKey(
        OwnActivity,
        on_delete=models.PROTECT,
        related_name="plans",
    )
    basketId = models.ForeignKey(
        OwnBasket,
        db_column="basketId",
        on_delete=models.PROTECT,
        related_name="plans",
    )

    class Meta:
        db_table = "own_plans"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        """Validate and persist ``self`` using Django's normal save arguments."""
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        """Return the plan title used to display ``self``."""
        return self.title


class OwnPlanFee(models.Model):
    plan = models.ForeignKey(
        OwnPlan,
        on_delete=models.CASCADE,
        related_name="fees",
    )
    fee = models.ForeignKey(
        OwnFee,
        on_delete=models.PROTECT,
        related_name="plan_fees",
    )
    value = models.DecimalField(max_digits=20, decimal_places=10)

    class Meta:
        db_table = "own_plan_fees"
        constraints = [
            models.UniqueConstraint(
                fields=["plan", "fee"], name="unique_own_plan_fee"
            )
        ]

    def __str__(self):
        """Return ``plan_id / Fee #fee_id`` as the display string for ``self``."""
        return f"{self.plan_id} / Fee #{self.fee_id}"
