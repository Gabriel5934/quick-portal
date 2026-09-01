from django.db import models


class OwnNetwork(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "own_network"
        ordering = ["id"]

    def __str__(self):
        return self.name


class OwnChannel(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "own_channels"
        ordering = ["id"]

    def __str__(self):
        return self.name


class OwnMethod(models.Model):
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "own_methods"
        ordering = ["id"]

    def __str__(self):
        return self.name


class OwnFee(models.Model):
    id = models.BigIntegerField(primary_key=True)
    basketId = models.IntegerField()
    basketName = models.CharField(max_length=20)
    value = models.FloatField()
    baseMdr = models.FloatField()
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
        return f"{self.basketName} / {self.method} / {self.id}"
