from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("quickportal", "0033_remove_business_cnae")]

    operations = [
        migrations.RemoveField(
            model_name="business",
            name="status",
        ),
    ]
