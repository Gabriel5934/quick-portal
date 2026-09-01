from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from own.models import OwnFee
from own.serializers import OwnFeeSerializer


class OwnFeeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnFeeSerializer
    pagination_class = None
    queryset = OwnFee.objects.select_related("network", "channel", "method").all()
