import logging
from rest_framework.generics import RetrieveAPIView, RetrieveUpdateAPIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from allauth.headless.contrib.rest_framework.authentication import (
    JWTTokenAuthentication,
)
from .serializers import UserSerializer, ProfileSerializer

logger = logging.getLogger(__name__)


class MeView(RetrieveAPIView):
    serializer_class = UserSerializer
    authentication_classes = [JWTTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserUpdateView(RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    authentication_classes = [JWTTokenAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.request.user.profile

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)