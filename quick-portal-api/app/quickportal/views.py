from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Exists, OuterRef, Q
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from quickportal.models import (
    Acquirer,
    BusinessColorPreference,
    BusinessDetails,
    BusinessMembership,
    BusinessRole,
    BusinessType,
    Cnae,
    Fee,
    Network,
    Plan,
    PosDevice,
    PosModel,
    RecurringFee,
)
from quickportal.serializers import (
    AcquirerSerializer,
    BusinessReadSerializer,
    BusinessColorPreferenceSerializer,
    BusinessDetailsSerializer,
    BusinessMembershipReadSerializer,
    BusinessMembershipWriteSerializer,
    BusinessWriteSerializer,
    CnaeSerializer,
    EmailTokenObtainPairSerializer,
    FeeSerializer,
    NetworkSerializer,
    PlanReadSerializer,
    PlanWriteSerializer,
    PosDeviceSerializer,
    PosModelSerializer,
    RecurringFeeSerializer,
    UserCreateSerializer,
)
from quickportal.services.brasil_api import BrasilApiError
from quickportal.services.business_access import (
    accessible_businesses,
    get_accessible_business_or_404,
    has_business_role,
    has_governing_ancestor_admin,
)


def _brasil_api_error_response(exc: BrasilApiError) -> Response:
    if exc.status_code and 400 <= exc.status_code < 500:
        return Response(
            {"error": f"invalid_{exc.resource or 'brasil_api_resource'}", "detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"error": "brasil_api_failed", "detail": str(exc)},
        status=status.HTTP_502_BAD_GATEWAY,
    )


def _get_object_or_none(model, pk):
    try:
        return model.objects.get(pk=pk)
    except model.DoesNotExist:
        return None


WRITE_ROLES = {BusinessRole.ADMIN, BusinessRole.MANAGER}


def _require_business_role(user, business, allowed_roles):
    if not has_business_role(user, business, allowed_roles):
        raise PermissionDenied()


def _get_recurring_fee_owner(user, owner_id):
    owner = get_accessible_business_or_404(user, owner_id)
    if owner.type not in {BusinessType.RESELLER, BusinessType.RE_RESELLER}:
        raise PermissionDenied("Recurring fees are only available to reseller businesses.")
    return owner


class UserRegistrationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class AcquirerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        acquirers = Acquirer.objects.all()
        serializer = AcquirerSerializer(acquirers, many=True)
        return Response(serializer.data)


class PosModelListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pos_models = PosModel.objects.select_related("acquirer").all()
        serializer = PosModelSerializer(pos_models, many=True)
        return Response(serializer.data)


class NetworkListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        networks = Network.objects.order_by("id")
        return Response(NetworkSerializer(networks, many=True).data)


class CnaeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cnaes = Cnae.objects.order_by("code")
        return Response(CnaeSerializer(cnaes, many=True).data)


class CnaesWithFeesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        acquirer_value = request.query_params.get("acquirer", "").strip()
        if not acquirer_value:
            return Response(
                {"detail": "The acquirer query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        acquirer = None
        if acquirer_value.isdigit():
            acquirer = Acquirer.objects.filter(pk=int(acquirer_value)).first()
        if acquirer is None:
            acquirer = Acquirer.objects.filter(name__iexact=acquirer_value).first()
        if acquirer is None:
            return Response(
                {"detail": "Acquirer not found."}, status=status.HTTP_404_NOT_FOUND
            )

        fee_exists = Fee.objects.filter(
            acquirer=acquirer,
            cnae=OuterRef("pk"),
        )
        cnaes = (
            Cnae.objects.annotate(has_fees=Exists(fee_exists))
            .filter(has_fees=True)
            .order_by("code")
        )
        return Response(CnaeSerializer(cnaes, many=True).data)


class FeeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        acquirer_value = request.query_params.get("acquirer", "").strip()
        cnae_value = request.query_params.get("cnae", "").strip()
        if not acquirer_value or not cnae_value:
            return Response(
                {"detail": "Both acquirer and cnae query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        acquirer = None
        if acquirer_value.isdigit():
            acquirer = Acquirer.objects.filter(pk=int(acquirer_value)).first()
        if acquirer is None:
            acquirer = Acquirer.objects.filter(name__iexact=acquirer_value).first()
        if acquirer is None:
            return Response(
                {"detail": "Acquirer not found."}, status=status.HTTP_404_NOT_FOUND
            )

        cnae = "".join(character for character in cnae_value if character.isdigit())
        if not cnae:
            return Response(
                {"detail": "CNAE must contain at least one digit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fees = (
            Fee.objects.select_related("network")
            .filter(acquirer=acquirer, cnae__code=cnae)
            .order_by("network__name", "installments")
        )
        return Response(FeeSerializer(fees, many=True).data)


class PlanListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plans = Plan.objects.select_related("cnae").prefetch_related("fees").all()
        return Response(PlanReadSerializer(plans, many=True).data)

    def post(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied()
        serializer = PlanWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        return Response(PlanReadSerializer(plan).data, status=status.HTTP_201_CREATED)


class PlanDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            plan = Plan.objects.select_related("cnae").prefetch_related("fees").get(pk=pk)
        except Plan.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(PlanReadSerializer(plan).data)


class BusinessPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class BusinessListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List businesses accessible to the authenticated user.

        ``request`` may provide ``parent``, ``document``, and case-insensitive
        ``name`` query parameters. ``parent`` includes both children and
        grandchildren of that business. Results use ``BusinessPagination``
        and return ``count``, ``next``, ``previous``, and ``results``.

        Returns a DRF ``Response`` containing the paginated business data.
        """
        businesses = accessible_businesses(request.user).order_by("id")
        if parent := request.query_params.get("parent"):
            businesses = businesses.filter(
                Q(parent_id=parent) | Q(parent__parent_id=parent)
            )
        if document := request.query_params.get("document"):
            businesses = businesses.filter(document=document)
        if name := request.query_params.get("name"):
            businesses = businesses.filter(name__icontains=name)
        paginator = BusinessPagination()
        page = paginator.paginate_queryset(businesses, request)
        serializer = BusinessReadSerializer(
            page,
            many=True,
            context={"request": request, "business_ids": [item.id for item in page]},
        )
        return Response({
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "results": serializer.data,
        })

    def post(self, request):
        """Create a business from ``request.data``.

        Root businesses require a superuser. Child businesses require the
        authenticated user to have admin access to the requested parent.
        BrasilAPI validation failures are translated to API errors. Returns a
        DRF ``Response`` with the created business and HTTP 201.
        """
        serializer = BusinessWriteSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            parent = serializer.validated_data.get("parent")
            if parent is None:
                if not request.user.is_superuser:
                    raise PermissionDenied()
            else:
                parent = get_accessible_business_or_404(request.user, parent.pk)
                _require_business_role(
                    request.user, parent, {BusinessRole.ADMIN}
                )
            business = serializer.save()
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class BusinessDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_object(self, user, pk):
        """Return business ``pk`` when accessible to ``user``, otherwise raise 404."""
        return get_accessible_business_or_404(user, pk)

    def get(self, request, pk):
        """Return business ``pk`` when it is accessible to ``request.user``.

        ``pk`` is the business path parameter. No request body is used.
        Inaccessible or missing businesses return the scoped not-found error;
        otherwise the returned DRF ``Response`` contains the business data.
        """
        business = self._get_object(request.user, pk)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data
        )

    def put(self, request, pk):
        """Fully update accessible business ``pk`` from ``request.data``.

        The user needs a write role, with admin-level checks for hierarchy
        changes. Managed CNPJ data may be validated through BrasilAPI. Returns
        a DRF ``Response`` containing the updated business.
        """
        business = self._get_object(request.user, pk)
        _require_business_role(request.user, business, WRITE_ROLES)
        serializer = BusinessWriteSerializer(business, data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            self._authorize_hierarchy_change(request, business, serializer)
            business = serializer.save()
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data
        )

    def patch(self, request, pk):
        """Partially update accessible business ``pk`` from ``request.data``.

        The user needs a write role, with admin-level checks for hierarchy
        changes. Only supplied fields are updated. Returns a DRF ``Response``
        containing the updated business.
        """
        business = self._get_object(request.user, pk)
        _require_business_role(request.user, business, WRITE_ROLES)
        serializer = BusinessWriteSerializer(business, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            self._authorize_hierarchy_change(request, business, serializer)
            business = serializer.save()
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data
        )

    def delete(self, request, pk):
        """Delete accessible business ``pk`` for an administrator.

        Returns HTTP 204 on success or HTTP 409 when protected children prevent
        deletion. Missing access raises the normal scoped not-found or
        permission response.
        """
        business = self._get_object(request.user, pk)
        _require_business_role(request.user, business, {BusinessRole.ADMIN})
        try:
            business.delete()
        except ProtectedError:
            return Response(
                {"detail": "The business cannot be deleted while it has child businesses."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _authorize_hierarchy_change(request, business, serializer):
        """Authorize hierarchy changes validated by ``serializer`` for ``business``.

        ``request`` supplies the acting user. The method returns ``None`` when
        no hierarchy change is requested or authorization succeeds, and raises
        permission/not-found exceptions for unauthorized target relationships.
        """
        new_type = serializer.validated_data.get("type", business.type)
        new_parent = serializer.validated_data.get("parent", business.parent)
        if new_type == business.type and new_parent == business.parent:
            return
        _require_business_role(request.user, business, {BusinessRole.ADMIN})
        if new_parent is None:
            if not request.user.is_superuser:
                raise PermissionDenied()
            return
        accessible_parent = get_accessible_business_or_404(request.user, new_parent.pk)
        _require_business_role(
            request.user, accessible_parent, {BusinessRole.ADMIN}
        )


class BusinessChildrenListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, owner_id):
        """Return accessible direct children of recurring-fee ``owner_id``.

        The owner path parameter must identify an accessible reseller or
        re-reseller. Results are ordered by name and use
        ``BusinessPagination`` (including its ``page`` and ``page_size`` query
        parameters). Returns the standard paginated DRF response.
        """
        owner = _get_recurring_fee_owner(request.user, owner_id)
        children = accessible_businesses(request.user).filter(parent=owner).order_by("name")
        paginator = BusinessPagination()
        page = paginator.paginate_queryset(children, request)
        return paginator.get_paginated_response(
            BusinessReadSerializer(
                page,
                many=True,
                context={
                    "request": request,
                    "business_ids": [item.id for item in page],
                },
            ).data
        )


class BusinessColorPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        """Set the authenticated user's color preference for business ``pk``.

        The business path parameter must be accessible to the user, and
        ``request.data.color`` must be a valid ``BusinessColor`` choice. The
        preference is created or updated for that user/business pair. Returns
        a DRF ``Response`` containing the saved ``color``.
        """
        business = get_accessible_business_or_404(request.user, pk)
        serializer = BusinessColorPreferenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preference, _ = BusinessColorPreference.objects.update_or_create(
            user=request.user,
            business=business,
            defaults={"color": serializer.validated_data["color"]},
        )
        return Response({"color": preference.color})


class RecurringFeeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, owner_id):
        """List paginated fees for accessible recurring-fee owner ``owner_id``.

        ``request`` supplies authentication and pagination values. Returns a
        paginated DRF response; inaccessible or invalid owners raise the
        scoped not-found or permission exception.
        """
        owner = _get_recurring_fee_owner(request.user, owner_id)
        fees = (
            RecurringFee.objects.filter(owner=owner)
            .select_related("owner", "created_by")
            .prefetch_related("targets")
        )
        paginator = BusinessPagination()
        page = paginator.paginate_queryset(fees, request)
        return paginator.get_paginated_response(
            RecurringFeeSerializer(
                page, many=True, context={"request": request, "owner": owner}
            ).data
        )

    def post(self, request, owner_id):
        """Create a fee for ``owner_id`` from ``request.data``.

        Returns the serialized fee with HTTP 201. Invalid data raises a
        validation error, while missing owners or insufficient write access
        raise the scoped not-found or permission exception.
        """
        owner = _get_recurring_fee_owner(request.user, owner_id)
        _require_business_role(request.user, owner, WRITE_ROLES)
        serializer = RecurringFeeSerializer(
            data=request.data, context={"request": request, "owner": owner}
        )
        serializer.is_valid(raise_exception=True)
        recurring_fee = serializer.save()
        return Response(
            RecurringFeeSerializer(
                recurring_fee, context={"request": request, "owner": owner}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class RecurringFeeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _get_object(owner, pk):
        """Return fee record ``pk`` belonging to recurring-fee ``owner``.

        Related targets are prefetched. ``NotFound`` is raised when the record
        does not belong to the supplied owner.
        """
        try:
            return (
                RecurringFee.objects.select_related("owner", "created_by")
                .prefetch_related("targets")
                .get(owner=owner, pk=pk)
            )
        except RecurringFee.DoesNotExist as exc:
            raise NotFound() from exc

    def get(self, request, owner_id, pk):
        """Return fee ``pk`` for accessible owner ``owner_id`` and ``request`` user."""
        owner = _get_recurring_fee_owner(request.user, owner_id)
        recurring_fee = self._get_object(owner, pk)
        return Response(
            RecurringFeeSerializer(
                recurring_fee, context={"request": request, "owner": owner}
            ).data
        )

    def patch(self, request, owner_id, pk):
        """Partially update fee ``pk`` for writable owner ``owner_id``.

        ``request.data`` supplies changes. Returns the updated serialized fee;
        invalid data, missing records, and insufficient access raise their
        standard DRF errors.
        """
        owner = _get_recurring_fee_owner(request.user, owner_id)
        _require_business_role(request.user, owner, WRITE_ROLES)
        recurring_fee = self._get_object(owner, pk)
        serializer = RecurringFeeSerializer(
            recurring_fee,
            data=request.data,
            partial=True,
            context={"request": request, "owner": owner},
        )
        serializer.is_valid(raise_exception=True)
        recurring_fee = serializer.save()
        return Response(
            RecurringFeeSerializer(
                recurring_fee, context={"request": request, "owner": owner}
            ).data
        )

    def delete(self, request, owner_id, pk):
        """Delete fee ``pk`` for writable owner ``owner_id`` and return HTTP 204."""
        owner = _get_recurring_fee_owner(request.user, owner_id)
        _require_business_role(request.user, owner, {BusinessRole.ADMIN})
        self._get_object(owner, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BusinessMembershipListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, business_id):
        business = self._get_admin_business(request.user, business_id)
        memberships = business.memberships.select_related("user").order_by("id")
        return Response(BusinessMembershipReadSerializer(memberships, many=True).data)

    def post(self, request, business_id):
        business = self._get_admin_business(request.user, business_id)
        serializer = BusinessMembershipWriteSerializer(
            data=request.data, context={"business": business}
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save(business=business)
        return Response(
            BusinessMembershipReadSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _get_admin_business(user, business_id):
        business = get_accessible_business_or_404(user, business_id)
        _require_business_role(user, business, {BusinessRole.ADMIN})
        return business


class BusinessMembershipDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, business_id, pk):
        business = BusinessMembershipListCreateView._get_admin_business(
            request.user, business_id
        )
        membership = self._get_membership(business, pk)
        serializer = BusinessMembershipWriteSerializer(
            membership,
            data=request.data,
            partial=True,
            context={"business": business},
        )
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data.get("role", membership.role)
        with transaction.atomic():
            self._protect_final_admin(membership, new_role)
            membership = serializer.save()
        return Response(BusinessMembershipReadSerializer(membership).data)

    def delete(self, request, business_id, pk):
        business = BusinessMembershipListCreateView._get_admin_business(
            request.user, business_id
        )
        membership = self._get_membership(business, pk)
        with transaction.atomic():
            self._protect_final_admin(membership, None)
            membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _get_membership(business, pk):
        try:
            return business.memberships.select_related(
                "business__parent__parent", "user"
            ).get(pk=pk)
        except BusinessMembership.DoesNotExist as exc:
            raise NotFound() from exc

    @staticmethod
    def _protect_final_admin(membership, new_role):
        if membership.role != BusinessRole.ADMIN or new_role == BusinessRole.ADMIN:
            return
        memberships = BusinessMembership.objects.select_for_update().filter(
            business=membership.business
        )
        has_other_admin = any(
            item.pk != membership.pk and item.role == BusinessRole.ADMIN
            for item in memberships
        )
        if not has_other_admin and not has_governing_ancestor_admin(
            membership.business
        ):
            raise ValidationError(
                {"role": "The final governing admin cannot be removed or demoted."}
            )


class BusinessDetailsListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        details = BusinessDetails.objects.select_related("business", "plan").filter(
            business__in=accessible_businesses(request.user)
        )
        if business_id := request.query_params.get("business"):
            details = details.filter(business_id=business_id)
        return Response(BusinessDetailsSerializer(details, many=True).data)

    def post(self, request):
        business_id = request.data.get("business")
        if business_id is not None:
            business = get_accessible_business_or_404(request.user, business_id)
            _require_business_role(request.user, business, WRITE_ROLES)
        serializer = BusinessDetailsSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        details = serializer.save()
        return Response(BusinessDetailsSerializer(details).data, status=status.HTTP_201_CREATED)


class BusinessDetailsDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        details = self._get_object(request.user, pk)
        return Response(BusinessDetailsSerializer(details).data)

    def put(self, request, pk):
        return self._update(request, pk)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial=False):
        details = self._get_object(request.user, pk)
        _require_business_role(request.user, details.business, WRITE_ROLES)
        serializer = BusinessDetailsSerializer(details, data=request.data, partial=partial)
        try:
            serializer.is_valid(raise_exception=True)
            target = serializer.validated_data.get("business", details.business)
            target = get_accessible_business_or_404(request.user, target.pk)
            _require_business_role(request.user, target, WRITE_ROLES)
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(BusinessDetailsSerializer(serializer.save()).data)

    def delete(self, request, pk):
        details = self._get_object(request.user, pk)
        _require_business_role(request.user, details.business, WRITE_ROLES)
        details.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _get_object(user, pk):
        try:
            return BusinessDetails.objects.select_related(
                "business", "business__parent"
            ).get(pk=pk, business__in=accessible_businesses(user))
        except BusinessDetails.DoesNotExist as exc:
            raise NotFound() from exc


class PosDeviceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        devices = PosDevice.objects.select_related("model", "business").filter(
            business__in=accessible_businesses(request.user)
        )
        if business_id := request.query_params.get("business"):
            devices = devices.filter(business_id=business_id)
        return Response(PosDeviceSerializer(devices, many=True).data)

    def post(self, request):
        business_id = request.data.get("business")
        if business_id is not None:
            business = get_accessible_business_or_404(request.user, business_id)
            _require_business_role(request.user, business, WRITE_ROLES)
        serializer = PosDeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(PosDeviceSerializer(serializer.save()).data, status=status.HTTP_201_CREATED)


class PosDeviceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        device = self._get_object(request.user, pk)
        return Response(PosDeviceSerializer(device).data)

    def put(self, request, pk):
        return self._update(request, pk)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial=False):
        device = self._get_object(request.user, pk)
        _require_business_role(request.user, device.business, WRITE_ROLES)
        serializer = PosDeviceSerializer(device, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        target = serializer.validated_data.get("business", device.business)
        target = get_accessible_business_or_404(request.user, target.pk)
        _require_business_role(request.user, target, WRITE_ROLES)
        return Response(PosDeviceSerializer(serializer.save()).data)

    def delete(self, request, pk):
        device = self._get_object(request.user, pk)
        _require_business_role(request.user, device.business, WRITE_ROLES)
        device.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _get_object(user, pk):
        try:
            return PosDevice.objects.select_related(
                "business", "business__parent"
            ).get(pk=pk, business__in=accessible_businesses(user))
        except PosDevice.DoesNotExist as exc:
            raise NotFound() from exc
