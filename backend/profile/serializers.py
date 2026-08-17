from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Profile

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['id', 'image', 'phone']


class UserSerializer(serializers.ModelSerializer):
    # FIX #2: key renamed from "profiles" → "profile" to match the
    # OneToOne related_name on Profile.user and what app.js now reads.
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'profile']