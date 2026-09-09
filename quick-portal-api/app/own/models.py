from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinLengthValidator, MinValueValidator, RegexValidator

from own.validators import validate_cpf


digits_only = RegexValidator(r"^\d+\Z", "This field must contain only digits.")


class OwnPartnerAttachmentType(models.TextChoices):
    ID_FRONT = "RGFRENTE", "ID front"
    ID_BACK = "RGVERSO", "ID back"
    CPF = "CPF", "CPF"
    DRIVER_LICENSE = "CNH", "Driver license"
    ADDRESS_PROOF = "COMPROVANTE_ENDERECO", "Proof of address"


class OwnBusinessAttachmentType(models.TextChoices):
    ADDRESS_PROOF = "COMPROVANTE_ENDERECO", "Proof of address"
    ARTICLES_OF_ASSOCIATION = "CONTRATO_SOCIAL", "Articles of association"
    ADHESION_TERM = "TERMO_ADESAO", "Adhesion term"


class OwnRegistrationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    REGISTERED = "REGISTERED", "Registered"
    FAILED = "FAILED", "Failed"
    UNKNOWN = "UNKNOWN", "Unknown"


class OwnAnticipationType(models.TextChoices):
    NONE = "None", "None"
    ROTATING = "Rotating", "Rotating"


class OwnNetwork(models.TextChoices):
    VISA = "Visa", "Visa"
    ELO = "Elo", "Elo"
    MASTERCARD = "Mastercard", "Mastercard"
    DEFAULT = "Default", "Default"


class OwnChannel(models.TextChoices):
    PHYSICAL = "Physical", "Physical"
    ECOMMERCE = "Ecommerce", "Ecommerce"


class OwnMethod(models.TextChoices):
    PIX = "Pix", "Pix"
    DEBIT = "Debit", "Debit"
    CREDIT = "Credit", "Credit"
    INSTALLMENTS = "Installments", "Installments"
    POS_RENT = "POS Rent", "POS Rent"
    TOP_BANK = "Top Bank", "Top Bank"
    VISA_VOUCHER = "Visa Voucher", "Visa Voucher"
    ANTICIPATION = "Anticipation", "Anticipation"


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
    network = models.CharField(
        max_length=50,
        choices=OwnNetwork.choices,
        null=True,
        blank=True,
    )
    channel = models.CharField(
        max_length=50,
        choices=OwnChannel.choices,
        null=True,
        blank=True,
    )
    method = models.CharField(
        max_length=50,
        choices=OwnMethod.choices,
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
    cnae = models.IntegerField(primary_key=True)
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


class OwnBusiness(models.Model):
    business = models.OneToOneField(
        "quickportal.Business",
        on_delete=models.CASCADE,
        related_name="own_business",
    )
    cnae = models.ForeignKey(
        OwnActivity,
        on_delete=models.PROTECT,
        related_name="businesses",
    )
    plan = models.ForeignKey(
        OwnPlan,
        on_delete=models.PROTECT,
        related_name="businesses",
    )
    signatory_name = models.CharField(max_length=200)
    signatory_cpf = models.CharField(
        max_length=11,
        validators=[digits_only, MinLengthValidator(11), validate_cpf],
    )
    signatory_email = models.EmailField()
    forecast_revenue = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    contract_revenue = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    postal_code = models.CharField(
        max_length=8,
        validators=[digits_only, MinLengthValidator(8)],
    )
    street = models.CharField(max_length=200)
    address_number = models.CharField(max_length=20)
    address_complement = models.CharField(max_length=200, blank=True)
    neighborhood = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    state = models.CharField(
        max_length=2,
        validators=[RegexValidator(r"^[A-Z]{2}\Z", "Enter a two-letter state code.")],
    )
    pos_quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    bank_code = models.CharField(max_length=10, validators=[digits_only])
    bank_branch = models.CharField(max_length=20, validators=[digits_only])
    bank_branch_digit = models.CharField(max_length=2, validators=[digits_only])
    bank_account = models.CharField(max_length=30, validators=[digits_only])
    bank_account_digit = models.CharField(max_length=2, validators=[digits_only])
    core_protocol = models.CharField(max_length=100, blank=True)
    contract_number = models.CharField(max_length=100, blank=True)
    registration_status = models.CharField(
        max_length=20,
        choices=OwnRegistrationStatus.choices,
        default=OwnRegistrationStatus.PENDING,
    )
    registration_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "own_businesses"
        ordering = ["id"]

    def clean(self):
        """Validate that this signup's ``plan`` belongs to its selected CNAE."""
        super().clean()
        try:
            plan_activity_id = self.plan.activity_id if self.plan_id else None
        except OwnPlan.DoesNotExist:
            plan_activity_id = None
        if self.cnae_id and plan_activity_id and plan_activity_id != self.cnae_id:
            raise ValidationError(
                {"plan": "The plan activity must match the business CNAE."}
            )

    def save(self, *args, **kwargs):
        """Validate and persist ``self`` using Django's normal save arguments."""
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        """Return the linked generic business as this signup's display name."""
        return f"OWN / {self.business}"


class OwnBusinessPartner(models.Model):
    own_business = models.ForeignKey(
        OwnBusiness,
        on_delete=models.CASCADE,
        related_name="partners",
    )
    cpf = models.CharField(
        max_length=11,
        validators=[digits_only, MinLengthValidator(11), validate_cpf],
    )

    class Meta:
        db_table = "own_business_partners"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["own_business", "cpf"],
                name="unique_own_business_partner_cpf",
            )
        ]

    def __str__(self):
        """Return ``own_business_id / CPF`` as the display string for ``self``."""
        return f"{self.own_business_id} / {self.cpf}"

    def save(self, *args, **kwargs):
        """Validate and persist ``self`` using Django's normal save arguments."""
        self.full_clean()
        return super().save(*args, **kwargs)


class OwnPartnerAttachment(models.Model):
    partner = models.ForeignKey(
        OwnBusinessPartner,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="own/partners/")
    original_name = models.CharField(max_length=255)
    type = models.CharField(max_length=25, choices=OwnPartnerAttachmentType.choices)

    class Meta:
        db_table = "own_partner_attachments"
        ordering = ["id"]

    def __str__(self):
        """Return the attachment's original file name for display."""
        return self.original_name

    def save(self, *args, **kwargs):
        """Validate and persist ``self`` using Django's normal save arguments."""
        self.full_clean()
        return super().save(*args, **kwargs)


class OwnBusinessAttachment(models.Model):
    own_business = models.ForeignKey(
        OwnBusiness,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="own/businesses/")
    original_name = models.CharField(max_length=255)
    type = models.CharField(max_length=25, choices=OwnBusinessAttachmentType.choices)

    class Meta:
        db_table = "own_business_attachments"
        ordering = ["id"]

    def __str__(self):
        """Return the attachment's original file name for display."""
        return self.original_name

    def save(self, *args, **kwargs):
        """Validate and persist ``self`` using Django's normal save arguments."""
        self.full_clean()
        return super().save(*args, **kwargs)
