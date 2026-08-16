from django.urls import path
from .views import MeView, UserUpdateView

urlpatterns = [
    path('me/', MeView.as_view(), name='profileview'),
    path('me/profile/update/', UserUpdateView.as_view(), name='update'),
]
