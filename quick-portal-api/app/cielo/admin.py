from django.contrib import admin

from cielo.models import CieloBusiness, CieloNotification


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


@admin.register(CieloNotification)
class CieloNotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "received_at",
        "change_type",
        "merchant_id",
        "cielo_business",
        "kyc_status",
        "bank_account_status",
        "onboarding_status",
    )
    search_fields = ("merchant_id",)
    list_filter = ("change_type",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
