from django.contrib import admin

from cielo.models import (
    CieloBusiness,
    CieloOnboardingNotification,
    CieloPlan,
    CieloPlanRate,
    CieloTransaction,
    CieloTransactionNotification,
)


class CieloPlanRateInline(admin.TabularInline):
    model = CieloPlanRate
    fields = ("card_brand", "method", "installments", "mdr", "fixed_fee")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(CieloPlan)
class CieloPlanAdmin(admin.ModelAdmin):
    """Read-only: plans are created through the API and never edited."""

    list_display = (
        "id",
        "name",
        "owner_business",
        "created_by",
        "created_at",
        "archived_at",
    )
    search_fields = ("name", "owner_business__name", "owner_business__document")
    list_filter = (("archived_at", admin.EmptyFieldListFilter),)
    inlines = (CieloPlanRateInline,)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CieloBusiness)
class CieloBusinessAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "business",
        "plan",
        "status",
        "merchant_id",
        "last_submitted_at",
    )
    search_fields = ("business__document", "merchant_id", "business__name")
    list_filter = ("status", "business__document_type")

    def get_readonly_fields(self, request, obj=None):
        # A seller's plan is fixed after signup.
        readonly_fields = super().get_readonly_fields(request, obj)
        return (*readonly_fields, "plan") if obj else readonly_fields


@admin.register(CieloOnboardingNotification)
class CieloOnboardingNotificationAdmin(admin.ModelAdmin):
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


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CieloTransaction)
class CieloTransactionAdmin(ReadOnlyAdmin):
    """Read-only: transactions are only written by notification lookups."""

    list_display = (
        "id",
        "payment_id",
        "cielo_business",
        "received_date",
        "amount",
        "payment_type",
        "brand",
        "status",
        "lookup_status",
        "last_lookup_at",
    )
    search_fields = ("payment_id", "merchant_id")
    list_filter = ("lookup_status",)


@admin.register(CieloTransactionNotification)
class CieloTransactionNotificationAdmin(ReadOnlyAdmin):
    list_display = ("id", "received_at", "change_type", "payment_id", "transaction")
    search_fields = ("payment_id",)
    list_filter = ("change_type",)
