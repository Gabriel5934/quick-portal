from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("own", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ownfee",
            name="value",
            field=models.FloatField(),
        ),
        migrations.AlterField(
            model_name="ownfee",
            name="baseMdr",
            field=models.FloatField(),
        ),
    ]
