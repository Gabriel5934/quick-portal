from django.db import migrations, models


def rename_failed_status(apps, schema_editor):
    OwnBusiness = apps.get_model("own", "OwnBusiness")
    OwnBusiness.objects.filter(registration_status="FAILED").update(
        registration_status="API_REQUEST_FAILED"
    )


def restore_failed_status(apps, schema_editor):
    OwnBusiness = apps.get_model("own", "OwnBusiness")
    OwnBusiness.objects.filter(registration_status="API_REQUEST_FAILED").update(
        registration_status="FAILED"
    )


class Migration(migrations.Migration):
    dependencies = [("own", "0011_ownbasket_fee_amount")]

    operations = [
        migrations.RunPython(rename_failed_status, restore_failed_status),
        migrations.AlterField(
            model_name="ownbusiness",
            name="registration_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("REGISTERED", "Registered"),
                    ("API_REQUEST_FAILED", "API request failed"),
                    ("UNKNOWN", "Unknown"),
                ],
                default="PENDING",
                max_length=20,
            ),
        ),
    ]
