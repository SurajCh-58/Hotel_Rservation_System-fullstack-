from rest_framework.generics import RetrieveAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated

from allauth.headless.contrib.rest_framework.authentication import (
    JWTTokenAuthentication,
)

from .serializers import UserSerializer, ProfileSerializer


class MeView(RetrieveAPIView):
    serializer_class = UserSerializer

    authentication_classes = [
        JWTTokenAuthentication,
    ]

    permission_classes = [
        IsAuthenticated,
    ]

    def get_object(self):
        return self.request.user


class UserUpdateView(RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer

    authentication_classes = [
        JWTTokenAuthentication,
    ]

    permission_classes = [
        IsAuthenticated,
    ]

    def get_object(self):
        return self.request.user.profile