from django.db import migrations, models
import django.db.models.deletion


def load_reference_data(apps, schema_editor):
    OwnNetwork = apps.get_model("own", "OwnNetwork")
    OwnChannel = apps.get_model("own", "OwnChannel")
    OwnMethod = apps.get_model("own", "OwnMethod")

    for name in ("Visa", "Elo", "Mastercard"):
        OwnNetwork.objects.get_or_create(name=name)
    for name in ("Physical", "Ecommerce"):
        OwnChannel.objects.get_or_create(name=name)
    for name in (
        "Pix",
        "Debit",
        "Credit",
        "Installments",
        "POS Rent",
        "Top Bank",
        "Visa Voucher",
    ):
        OwnMethod.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="OwnChannel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=50, unique=True)),
            ],
            options={"db_table": "own_channels", "ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="OwnMethod",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=50, unique=True)),
            ],
            options={"db_table": "own_methods", "ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="OwnNetwork",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=50, unique=True)),
            ],
            options={"db_table": "own_network", "ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="OwnFee",
            fields=[
                ("id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("basketId", models.IntegerField()),
                ("basketName", models.CharField(max_length=20)),
                ("value", models.DecimalField(decimal_places=10, max_digits=20)),
                ("baseMdr", models.DecimalField(decimal_places=10, max_digits=20)),
                ("installment", models.IntegerField(blank=True, null=True)),
                ("upperInstallment", models.IntegerField(blank=True, null=True)),
                ("channel", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="fees", to="own.ownchannel")),
                ("method", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="fees", to="own.ownmethod")),
                ("network", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="fees", to="own.ownnetwork")),
            ],
            options={"db_table": "own_fees", "ordering": ["id"]},
        ),
        migrations.RunPython(load_reference_data, migrations.RunPython.noop),
    ]
