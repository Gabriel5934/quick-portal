from django.core.validators import MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("own", "0009_ownactivity_integer_cnae")]

    operations = [
        migrations.AddField(
            model_name="ownbasket",
            name="anticipation_fee",
            field=models.DecimalField(
                decimal_places=10,
                default=0,
                max_digits=20,
                validators=[MinValueValidator(0)],
            ),
        ),
        migrations.AlterField(
            model_name="ownbasket",
            name="name",
            field=models.CharField(max_length=255, unique=True),
        ),
    ]
