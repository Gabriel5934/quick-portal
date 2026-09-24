from django.contrib import admin

from cielo.models import CieloBusiness


@admin.register(CieloBusiness)
class CieloBusinessAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "business",
        "status",
        "merchant_id",
        "last_submitted_at",
    )
    search_fields = ("business__document", "merchant_id", "business__name")
    list_filter = ("status", "business__document_type")
