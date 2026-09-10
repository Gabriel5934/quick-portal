from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("own", "0010_ownbasket_anticipation_fee")]

    operations = [
        migrations.AddField(
            model_name="ownbasket",
            name="fee_amount",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
