from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("own", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ownfee",
            name="value",
            field=models.DecimalField(decimal_places=10, max_digits=20),
        ),
        migrations.AlterField(
            model_name="ownfee",
            name="baseMdr",
            field=models.DecimalField(decimal_places=10, max_digits=20),
        ),
    ]
