"""
HotelReservation/settings.py
─────────────────────────────────────────────────────────────────────────────
Verified for django-allauth 65.19.1.

KEY CHANGE FROM YOUR ORIGINAL:
    django.contrib.sites  ← REMOVED from INSTALLED_APPS
    SITE_ID              ← REMOVED

WHY:
    The Sites framework requires a SocialApp database row to find the
    Google client_id / secret. You said you do NOT want credentials in
    the database.

    When you use SOCIALACCOUNT_PROVIDERS with the nested APP dict,
    allauth reads credentials directly from settings — no SocialApp DB
    row needed, no Sites framework needed.

    The old code had BOTH (Sites framework AND APP dict) which caused
    SocialApp.objects.get_current("google") to raise DoesNotExist
    because the DB row was never created.

    Our new view uses get_adapter().get_provider(request, "google",
    client_id=...) which resolves the app from the APP dict in
    SOCIALACCOUNT_PROVIDERS, not from the database.
─────────────────────────────────────────────────────────────────────────────
"""

import os
from pathlib import Path
import environ
from corsheaders.defaults import default_headers

# ==============================================================================
# ENVIRONMENT & BASE DIRECTORY SETUP
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

# ==============================================================================
# CORE DJANGO CONFIGURATION
# ==============================================================================

SECRET_KEY = env('DJANGO_SECRET_KEY')
DEBUG = env.bool('DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])

ROOT_URLCONF = 'HotelReservation.urls'
WSGI_APPLICATION = 'HotelReservation.wsgi.application'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ==============================================================================
# APPLICATION DEFINITION
# ==============================================================================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # ↑ django.contrib.sites is intentionally ABSENT.
    #   We use SOCIALACCOUNT_PROVIDERS APP dict (settings-based config),
    #   which does NOT need the Sites framework or a DB SocialApp row.

    # Third-party apps
    'corsheaders',
    'rest_framework',
    'allauth',
    'allauth.account',
    'allauth.headless',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',

    # Local apps
    'profile.apps.AccountConfig',
]

# NOTE: No SITE_ID — not needed without django.contrib.sites.

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ==============================================================================
# AUTHENTICATION & USER MODEL
# ==============================================================================

AUTH_USER_MODEL = 'profile.User'

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ==============================================================================
# CORS & CSRF CONFIGURATION
# ==============================================================================

CORS_ALLOWED_ORIGINS = [
    'http://localhost',       # nginx frontend at port 80
    'http://localhost:5500',  # VS Code Live Server (dev)
    'http://localhost:8000',  # Django backend (admin/dev)
]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    *default_headers,
    "x-session-token",
    "X-Session-Token",
    "x-email-verification-key",
    "x-password-reset-key",
    "x-password-reset-code",
]

CORS_EXPOSE_HEADERS = [
    "X-Session-Token",
    "x-session-token",
]

CSRF_TRUSTED_ORIGINS = [
    'http://localhost',
    'http://localhost:5500',
    'http://localhost:8000',
]

# ==============================================================================
# DJANGO ALLAUTH CONFIGURATION (65.19.x Headless App Strategy)
# ==============================================================================

ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_USER_MODEL_USERNAME_FIELD = "username"
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_PREVENT_ENUMERATION = False

# ── Signup & Email OTP ────────────────────────────────────────────────────────
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED = True
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_MAX_ATTEMPTS = 5
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_TIMEOUT = 3600
ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND = True
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True

# ── Password Reset OTP ────────────────────────────────────────────────────────
ACCOUNT_PASSWORD_RESET_BY_CODE_ENABLED = True
ACCOUNT_PASSWORD_RESET_TOKEN_FLOW = "code"
ACCOUNT_PASSWORD_RESET_BY_CODE_MAX_ATTEMPTS = 5
ACCOUNT_PASSWORD_RESET_BY_CODE_TIMEOUT = 900
ACCOUNT_LOGIN_ON_PASSWORD_RESET = True

# ── Custom Adapters & Forms ───────────────────────────────────────────────────
ACCOUNT_ADAPTER = "profile.adapter.CustomAccountAdapter"
ACCOUNT_SIGNUP_FORM_CLASS = "profile.forms.CustomSignupForm"
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*"]

# ── Headless Frontend URLs & Core Spec ────────────────────────────────────────
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": "http://localhost/account/verify-email/{key}",
    "account_reset_password_from_key": "http://localhost/account/password/reset/key/{key}",
}
HEADLESS_SERVE_SPECIFICATION = DEBUG

# ── Headless Client & Token Strategy (JWT) ────────────────────────────────────
HEADLESS_CLIENTS = ("app",)

HEADLESS_TOKEN_STRATEGY = (
    "allauth.headless.tokens.strategies.jwt.JWTTokenStrategy"
)

HEADLESS_JWT_PRIVATE_KEY = env("ALLAUTH_JWT_PRIVATE_KEY").replace("\\n", "\n")
HEADLESS_JWT_ACCESS_TOKEN_EXPIRES_IN = 3600
HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN = 86400 * 7
HEADLESS_JWT_ROTATE_REFRESH_TOKEN = True

# ==============================================================================
# GOOGLE OAUTH SETTINGS
# ==============================================================================

# Expose client credentials as top-level Django settings so views.py
# can access them via settings.GOOGLE_CLIENT_ID / settings.GOOGLE_CLIENT_SECRET
# without re-importing environ in every file.
#
# These values come from .env — the client secret NEVER reaches the browser.
GOOGLE_CLIENT_ID     = env('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET')

# ==============================================================================
# SOCIAL ACCOUNT CONFIGURATION
# ==============================================================================

SOCIALACCOUNT_ADAPTER = "profile.adapter.CustomSocialAccountAdapter"

# Google pre-verifies email addresses via their OIDC flow.
# Setting this to "none" means Google users are logged in immediately
# without a separate email OTP step.
# Your email/password users still go through ACCOUNT_EMAIL_VERIFICATION = "mandatory".
SOCIALACCOUNT_EMAIL_VERIFICATION = "none"

# Require POST to finalise social login — prevents CSRF-style GET login.
SOCIALACCOUNT_LOGIN_ON_GET = False

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        # ── APP dict: credentials live HERE (in settings/env), NOT in DB ──────
        #
        # When this nested APP dict is present, allauth reads client_id and
        # secret directly from settings. No SocialApp database row is needed.
        # No django.contrib.sites is needed. No SITE_ID is needed.
        #
        # Our GoogleAuthCodeView calls:
        #     get_adapter().get_provider(request, "google", client_id=...)
        # which resolves the app from this dict, not from the database.
        'APP': {
            'client_id': env('GOOGLE_CLIENT_ID'),
            'secret':    env('GOOGLE_CLIENT_SECRET'),
            'key':       '',
        },

        # ── Scopes ────────────────────────────────────────────────────────────
        # openid  → enables OIDC; gives us the "sub" claim (stable unique user ID)
        # email   → gives us the user's email address
        # profile → gives us name, picture
        # We do NOT request calendar/drive/gmail — those need extra consent.
        'SCOPE': ['openid', 'profile', 'email'],

        'AUTH_PARAMS': {
            'access_type': 'offline',
        },

        # Fetch additional user info from Google's userinfo endpoint.
        # This fills in name/picture fields that may be missing from the ID token.
        'FETCH_USERINFO': True,

        # Trust Google's email_verified claim.
        # When True, allauth skips its own email verification for Google users.
        'EMAIL_AUTHENTICATION': True,
    }
}

# ==============================================================================
# DJANGO REST FRAMEWORK (DRF)
# ==============================================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'allauth.headless.contrib.rest_framework.authentication.JWTTokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.JSONParser',
    ],
}

# ==============================================================================
# DATABASE & EMAIL
# ==============================================================================

DATABASES = {
    'default': env.db('DATABASE_URL')
}

EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')

# ==============================================================================
# INTERNATIONALIZATION & TIMEZONE
# ==============================================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ==============================================================================
# STATIC & MEDIA FILES
# ==============================================================================

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ==============================================================================
# PRODUCTION SECURITY FLAGS
# ==============================================================================

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')