from django.db import migrations, models
import django.db.models.deletion


CHOICES = {
    "network": ["Visa", "Elo", "Mastercard", "Default"],
    "channel": ["Physical", "Ecommerce"],
    "method": [
        "Pix", "Debit", "Credit", "Installments", "POS Rent", "Top Bank",
        "Visa Voucher", "Anticipation",
    ],
}


def copy_names(apps, schema_editor):
    """Preserve lookup names, refusing unsupported values before removing tables."""
    database = schema_editor.connection.alias
    Fee = apps.get_model("own", "OwnFee")
    for field, choices in CHOICES.items():
        Reference = apps.get_model("own", f"Own{field.title()}")
        references = Reference.objects.using(database)
        unknown = list(references.exclude(name__in=choices).values_list("name", flat=True))
        if unknown:
            raise ValueError(f"Unsupported OWN {field} values: {unknown!r}")
        for reference in references.iterator():
            Fee.objects.using(database).filter(**{f"{field}_id": reference.pk}).update(
                **{f"{field}_text": reference.name}
            )

    # Flush deferred FK checks before the following schema changes.
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


def restore_references(apps, schema_editor):
    """Recreate reference rows and reconnect fees when rolling back."""
    database = schema_editor.connection.alias
    Fee = apps.get_model("own", "OwnFee")
    for field, choices in CHOICES.items():
        Reference = apps.get_model("own", f"Own{field.title()}")
        for name in choices:
            reference, _ = Reference.objects.using(database).get_or_create(name=name)
            Fee.objects.using(database).filter(**{f"{field}_text": name}).update(
                **{f"{field}_id": reference.pk}
            )

    # Flush deferred FK checks before the following schema changes.
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    dependencies = [("own", "0007_alter_ownbusiness_registration_status_and_more")]

    operations = [
        # Nullable temporarily so reversing RemoveField can recreate the FK column.
        migrations.AlterField(
            model_name="ownfee",
            name="method",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="fees",
                to="own.ownmethod",
            ),
        ),
        *[
            migrations.AddField(
                model_name="ownfee",
                name=f"{field}_text",
                field=models.CharField(max_length=50, null=True),
            )
            for field in CHOICES
        ],
        migrations.RunPython(copy_names, restore_references),
        *[
            migrations.RemoveField(model_name="ownfee", name=field)
            for field in CHOICES
        ],
        *[
            migrations.RenameField(
                model_name="ownfee", old_name=f"{field}_text", new_name=field
            )
            for field in CHOICES
        ],
        *[
            migrations.AlterField(
                model_name="ownfee",
                name=field,
                field=models.CharField(
                    max_length=50,
                    choices=[(value, value) for value in choices],
                    **({"null": True, "blank": True} if field != "method" else {}),
                ),
            )
            for field, choices in CHOICES.items()
        ],
        migrations.DeleteModel(name="OwnNetwork"),
        migrations.DeleteModel(name="OwnChannel"),
        migrations.DeleteModel(name="OwnMethod"),
    ]
