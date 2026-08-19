"""
profile/views.py
────────────────────────────────────────────────────────────────────────────────
Verified against django-allauth 65.19.1.
────────────────────────────────────────────────────────────────────────────────
"""

import logging

import requests as http_requests

from django.conf import settings
from django.http import JsonResponse

from rest_framework.generics import RetrieveAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from allauth.headless.contrib.rest_framework.authentication import (
    JWTTokenAuthentication,
)

from .serializers import UserSerializer, ProfileSerializer

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  EXISTING VIEWS — unchanged
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
#  GOOGLE AUTHORIZATION-CODE VIEW
# ─────────────────────────────────────────────────────────────────────────────

class GoogleAuthCodeView(APIView):
    """
    POST /api/auth/google/

    Receives the Google authorization code from the SPA, exchanges it
    server-side with Google, passes the result into django-allauth, and
    returns allauth's standard headless JWT response.

    Request body:
        { "code": "4/0Ab…" }

    Success response (200):
        {
            "status": 200,
            "data": { "user": {…}, "methods": […] },
            "meta": {
                "is_authenticated": true,
                "access_token": "eyJ…",
                "refresh_token": "eyJ…"
            }
        }
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        code = request.data.get("code", "").strip()
        if not code:
            return JsonResponse(
                {"detail": "Google authorization code is required."},
                status=400,
            )

        # Step 1: exchange the authorization code with Google, server-to-server
        google_tokens = self._exchange_code(code)

        if google_tokens is None:
            return JsonResponse(
                {"detail": "Unable to communicate with Google. Try again."},
                status=502,
            )

        if "error" in google_tokens:
            error_desc = google_tokens.get(
                "error_description", google_tokens.get("error", "unknown")
            )
            logger.warning("Google token exchange failed: %s", error_desc)
            return JsonResponse(
                {
                    "detail": "Google authorization failed. The code may be "
                              "expired or already used.",
                    "code": google_tokens.get("error"),
                },
                status=400,
            )

        id_token_jwt = google_tokens.get("id_token")
        if not id_token_jwt:
            logger.error("Google exchange succeeded but returned no id_token.")
            return JsonResponse(
                {"detail": "Google did not return an ID token."},
                status=400,
            )

        # Step 2: hand the ID token through allauth and return JWT
        return self._complete_allauth_login(request, id_token_jwt)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _exchange_code(self, code):
        """
        POST to Google's token endpoint server-to-server.

        WHY redirect_uri="postmessage":
          GIS popup flow (ux_mode: 'popup') never redirects the browser.
          Google uses the literal string "postmessage" internally.
          Sending any real URL causes redirect_uri_mismatch.
        """
        try:
            resp = http_requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "redirect_uri": "postmessage",
                },
                timeout=10,
            )
            return resp.json()
        except http_requests.RequestException as exc:
            logger.error("Network error contacting Google: %s", exc)
            return None

    def _complete_allauth_login(self, request, id_token_jwt):
        """
        Decode the ID token and drive it through allauth's social login
        pipeline, returning the headless JWT response.

        ── WHY WE SKIP SIGNATURE VERIFICATION ──────────────────────────────
        The OpenID Connect Core 1.0 spec §3.1.3.7 rule #2 states:

            "If the ID Token is received via direct communication between
             the Client and the Token Endpoint (which it is in this flow),
             the TLS server validation MAY be used to validate the issuer
             in place of checking the token signature."

        allauth's own OAuth2Adapter does exactly this:

            # GoogleOAuth2Adapter._decode_id_token():
            verify_signature = not self.did_fetch_access_token
            # → False when the adapter itself fetched the token (server-to-server)
            # → True  only when the token arrived directly from the browser

        Because WE fetched the token from Google over TLS in _exchange_code(),
        we are in the same position as allauth's adapter. We tell allauth to
        skip the signature check exactly as it does for itself.

        SECURITY IS NOT REDUCED: even with verify_signature=False, PyJWT still
        enforces all of these in verify_and_decode():
            verify_iss = True  → issuer must be https://accounts.google.com
            verify_aud = True  → audience must match our client_id
            verify_exp = True  → token must not be expired
        The only thing skipped is the RSA signature check, which would require
        a separate network round-trip to fetch Google's public keys — a round-trip
        that is redundant when we already authenticated with Google over TLS.

        ── WHAT EACH ALLAUTH CALL DOES ─────────────────────────────────────
        _verify_and_decode(app, id_token, verify_signature=False)
            → decodes the JWT, validates iss/aud/exp
            → returns the claim dict: {sub, email, name, picture, …}

        provider.sociallogin_from_response(request, identity_data)
            → calls provider.extract_uid() → sets SocialAccount.uid
            → calls provider.extract_common_fields() → sets user fields
            → calls provider.extract_email_addresses() → sets verified email
            → returns a SocialLogin object (no DB writes yet)

        mark_request_as_headless(request, Client.APP)
            → sets request.allauth.headless.client = Client.APP
            → required by AuthenticationResponse / expose_session_token

        authentication_context(request)
            → sets request.allauth.headless._pre_user = (anon user before login)
            → required by expose_access_token to decide to mint a new JWT
            → manages a clean session lifecycle for the pipeline

        complete_token_login(request, social_login)
            → calls flows.login.complete_login(request, social_login, raises=True)
            → runs CustomSocialAccountAdapter.populate_user() (your adapter)
            → finds or creates Django User + SocialAccount
            → logs the user into request.session via Django's login()
            → emits user_signed_up / user_logged_in signals

        AuthenticationResponse(request)
            → sees request.user is now authenticated
            → compares with _pre_user → mints new JWT
            → returns {status:200, data:{user,methods}, meta:{access_token,refresh_token}}
        """
        try:
            from allauth.socialaccount.adapter import get_adapter as get_sa_adapter
            from allauth.socialaccount.providers.google.views import _verify_and_decode
            from allauth.socialaccount.providers.oauth2.client import OAuth2Error
            from allauth.headless.socialaccount.internal import complete_token_login
            from allauth.headless.base.response import AuthenticationResponse
            from allauth.headless.constants import Client
            from allauth.headless.internal.decorators import mark_request_as_headless
            from allauth.headless.internal.authkit import authentication_context
            from allauth.socialaccount.providers.base.constants import AuthProcess
        except ImportError as exc:
            logger.error("allauth import error: %s", exc)
            return JsonResponse(
                {"detail": "Server configuration error."},
                status=500,
            )

        # ── Resolve the Google provider (reads SOCIALACCOUNT_PROVIDERS) ───────
        try:
            provider = get_sa_adapter().get_provider(
                request,
                "google",
                client_id=settings.GOOGLE_CLIENT_ID,
            )
        except Exception as exc:
            logger.error("Could not load Google provider: %s", exc)
            return JsonResponse(
                {"detail": "Google is not configured on this server."},
                status=500,
            )

        # ── Decode and validate the ID token (skip signature per OIDC spec) ───
        #
        # We call _verify_and_decode directly instead of provider.verify_token()
        # because verify_token() always passes verify_signature=True (the default),
        # which tries to fetch Google's RSA public keys over a second network request.
        # That second request is both unnecessary (we already have TLS trust from the
        # code exchange) and a source of failures (cert endpoint unreachable → error).
        #
        # _verify_and_decode is a module-level function in:
        #   allauth.socialaccount.providers.google.views
        # It has been present and stable since allauth introduced Google support.
        try:
            identity_data = _verify_and_decode(
                app=provider.app,
                credential=id_token_jwt,
                verify_signature=False,  # safe: we fetched this token over TLS ourselves
            )
        except (OAuth2Error, Exception) as exc:
            logger.warning("Google ID token decode failed: %s", exc)
            return JsonResponse(
                {
                    "detail": "Google ID token is invalid or expired.",
                    "code": "invalid_id_token",
                },
                status=400,
            )

        # ── Build the SocialLogin from the decoded claims ─────────────────────
        try:
            social_login = provider.sociallogin_from_response(request, identity_data)
        except Exception as exc:
            logger.warning("sociallogin_from_response failed: %s", exc)
            return JsonResponse(
                {"detail": "Could not build social login from Google data."},
                status=400,
            )

        # ── Set state: headless=True tells allauth to return JSON, not redirect ─
        social_login.state = {
            "headless": True,
            "process": AuthProcess.LOGIN,
            "next": "/",
        }

        # ── Mark request as headless APP client ───────────────────────────────
        #
        # AccountMiddleware sets request.allauth = SimpleNamespace() but does NOT
        # set request.allauth.headless. AuthenticationResponse needs .headless.client.
        # This mirrors what @app_view does for allauth's own views.
        mark_request_as_headless(request, Client.APP)

        # ── Run the login pipeline inside the authentication context ──────────
        #
        # authentication_context sets _pre_user so expose_access_token knows
        # to mint a new JWT when the user transitions from anonymous → logged in.
        try:
            with authentication_context(request):
                try:
                    complete_token_login(request, social_login)
                except Exception as exc:
                    logger.warning("complete_token_login failed: %s", exc)
                    return JsonResponse(
                        {
                            "detail": "Google sign-in was rejected. "
                                      "This account may not be permitted to sign up.",
                            "code": "login_rejected",
                        },
                        status=403,
                    )

                if request.user.is_authenticated:
                    # Guarantee the Profile row exists before we return.
                    #
                    # WHY: the post_save signal that creates Profile fires
                    # when the User is first saved. However, allauth's social
                    # login pipeline may complete the login and call
                    # complete_token_login() before the signal has had a chance
                    # to commit — or the signal may not have fired at all if
                    # the user already existed (connect_by_email path).
                    #
                    # get_or_create is idempotent: for new users it creates the
                    # row (no-op if the signal already did it); for returning
                    # users it just fetches the existing row. Either way,
                    # request.user.profile will succeed when /api/me/ is called
                    # immediately after this response.
                    from .models import Profile as _Profile
                    _Profile.objects.get_or_create(user=request.user)
                    return AuthenticationResponse(request)

                # Pending state (rare with SOCIALACCOUNT_EMAIL_VERIFICATION=none)
                logger.info(
                    "Google login landed in pending state for: %s",
                    getattr(request, "user", "unknown"),
                )
                return JsonResponse(
                    {
                        "status": 401,
                        "detail": "Additional steps required to complete sign-in.",
                        "code": "pending",
                        "data": {"flows": [{"id": "verify_email", "is_pending": True}]},
                    },
                    status=401,
                )

        except Exception as exc:
            logger.error("Unexpected error in Google auth: %s", exc, exc_info=True)
            return JsonResponse(
                {"detail": "An unexpected error occurred during Google sign-in."},
                status=500,
            )