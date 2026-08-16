from pathlib import Path
import os
import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = env('DJANGO_SECRET_KEY')

DEBUG = env.bool('DEBUG', default=False)

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'profile.apps.AccountConfig',
    'rest_framework',
    'allauth',
    'allauth.account',
    'allauth.headless',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
]

AUTH_USER_MODEL = 'profile.User'

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

CORS_ALLOWED_ORIGINS = [
    'http://localhost',
    'http://localhost:5500',
]

CORS_ALLOW_HEADERS = (
    *default_headers,
    "x-session-token",
    "x-email-verification-key",
    "x-password-reset-key",
)

# Expose X-Session-Token so frontend JS can read it from the signup response.
# Without this, res.headers.get('X-Session-Token') returns null in the browser.
CORS_EXPOSE_HEADERS = ["X-Session-Token"]

HEADLESS_SERVE_SPECIFICATION = True

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    'http://localhost',
    'http://localhost:5500',
]

ROOT_URLCONF = 'HotelReservation.urls'

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

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

# ============ SOCIAL ACCOUNT ============
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': env('GOOGLE_CLIENT_ID'),
            'secret': env('GOOGLE_CLIENT_SECRET'),
            'key': ''
        },
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
    }
}

# ============ ALLAUTH ============
# ==============================
# ALLAUTH
# ==============================

ACCOUNT_LOGIN_METHODS = {"email"}

ACCOUNT_USER_MODEL_USERNAME_FIELD = "username"

ACCOUNT_EMAIL_VERIFICATION = "mandatory"

ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED = True

ACCOUNT_PASSWORD_RESET_BY_CODE = True

ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True

ACCOUNT_EMAIL_VERIFICATION_BY_CODE_MAX_ATTEMPTS = 5

ACCOUNT_ADAPTER = "profile.adapter.CustomAccountAdapter"

ACCOUNT_SIGNUP_FORM_CLASS = "profile.forms.CustomSignupForm"

ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*"]

ACCOUNT_EMAIL_VERIFICATION_BY_CODE_TIMEOUT = 3600  # seconds (default is 180 = 3 minutes)

ACCOUNT_EMAIL_VERIFICATION_SUPPORTS_RESEND = True  # enables POST /auth/email/verify/resend

ACCOUNT_EMAIL_VERIFICATION_BY_CODE_FORMAT = {
    "numeric": True,
    "dashed": False,
    "length": 6,
}
# ============ EMAIL ============
# OTP prints in docker logs — run: docker compose logs web --tail=50
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')

# ============ HEADLESS JWT ============
# ==============================
# HEADLESS JWT
# ==============================

HEADLESS_CLIENTS = ("app",)

HEADLESS_TOKEN_STRATEGY = (
    "allauth.headless.tokens.strategies.jwt.JWTTokenStrategy"
)

HEADLESS_JWT_PRIVATE_KEY = env(
    "ALLAUTH_JWT_PRIVATE_KEY"
).replace("\\n", "\n")

HEADLESS_JWT_ACCESS_TOKEN_EXPIRES_IN = 3600

HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN = 86400 * 7

HEADLESS_JWT_ROTATE_REFRESH_TOKEN = True

# ============ DRF ============
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'allauth.headless.contrib.rest_framework.authentication.JWTTokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

WSGI_APPLICATION = 'HotelReservation.wsgi.application'

DATABASES = {
    'default': env.db('DATABASE_URL')
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'UTC'
USE_I18N      = True
USE_TZ        = True

# ============ STATIC FILES ============
STATIC_URL  = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ============ MEDIA ============
MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'