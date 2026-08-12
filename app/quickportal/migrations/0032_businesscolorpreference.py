import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("quickportal", "0031_recurring_fee"),
    ]

    operations = [
        migrations.CreateModel(
            name="BusinessColorPreference",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "color",
                    models.CharField(
                        choices=[
                            ("blue", "Blue"),
                            ("green", "Green"),
                            ("yellow", "Yellow"),
                            ("purple", "Purple"),
                            ("orange", "Orange"),
                        ],
                        default="blue",
                        max_length=10,
                    ),
                ),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="color_preferences",
                        to="quickportal.business",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="business_color_preferences",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "business_color_preference"},
        ),
        migrations.AddConstraint(
            model_name="businesscolorpreference",
            constraint=models.UniqueConstraint(
                fields=("user", "business"),
                name="unique_user_business_color_preference",
            ),
        ),
    ]
