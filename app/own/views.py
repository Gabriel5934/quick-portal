from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import IsAuthenticated

from own.models import OwnActivity, OwnFee, OwnPlan
from own.serializers import (
    OwnActivitySerializer,
    OwnFeeSerializer,
    OwnPlanSerializer,
)


class OwnFeeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnFeeSerializer
    pagination_class = None
    queryset = OwnFee.objects.select_related(
        "basketId", "network", "channel", "method"
    ).all()


class OwnActivityListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnActivitySerializer
    pagination_class = None
    queryset = OwnActivity.objects.all()


class OwnPlanListCreateView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnPlanSerializer

    def get_queryset(self):
        """Return plans with their audit, activity, basket, and fee relations.

        ``self`` is the active list/create view. The returned optimized queryset
        is used to serve the authenticated request.
        """
        return OwnPlan.objects.select_related(
            "activity", "basketId", "created_by", "updated_by"
        ).prefetch_related("fees")

    def perform_create(self, serializer):
        """Save ``serializer`` with the requesting user as both audit users.

        ``serializer`` is the validated plan serializer. Returns ``None``.
        """
        serializer.save(created_by=self.request.user, updated_by=self.request.user)


class OwnPlanDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnPlanSerializer
    queryset = OwnPlan.objects.select_related(
        "activity", "basketId", "created_by", "updated_by"
    ).prefetch_related("fees")

    def perform_update(self, serializer):
        """Save ``serializer`` with the requesting user as the updating user.

        ``serializer`` is the validated plan serializer. Returns ``None``.
        """
        serializer.save(updated_by=self.request.user)
