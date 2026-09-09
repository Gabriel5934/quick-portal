from django.db import migrations, models


def normalize_cnaes(apps, schema_editor):
    """Normalize existing keys and preserve plan and business references."""
    database = schema_editor.connection.alias
    Activity = apps.get_model("own", "OwnActivity")
    Plan = apps.get_model("own", "OwnPlan")
    Business = apps.get_model("own", "OwnBusiness")
    activities = list(Activity.objects.using(database).all())
    normalized = {}
    for activity in activities:
        cnae = str(int(activity.pk.translate(str.maketrans("", "", "./-"))))
        if cnae in normalized:
            raise ValueError(f"Multiple OWN activities normalize to CNAE {cnae}.")
        normalized[cnae] = activity

    for cnae, activity in normalized.items():
        if cnae == activity.pk:
            continue
        Activity.objects.using(database).create(
            cnae=cnae, description=activity.description, mcc=activity.mcc,
        )
        Plan.objects.using(database).filter(activity_id=activity.pk).update(activity_id=cnae)
        Business.objects.using(database).filter(cnae_id=activity.pk).update(cnae_id=cnae)
        Activity.objects.using(database).filter(pk=activity.pk).delete()

    # Flush deferred FK checks before altering the referenced columns.
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    dependencies = [("own", "0008_own_fee_text_choices")]

    operations = [
        migrations.RunPython(normalize_cnaes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="ownactivity",
            name="cnae",
            field=models.IntegerField(primary_key=True, serialize=False),
        ),
    ]
