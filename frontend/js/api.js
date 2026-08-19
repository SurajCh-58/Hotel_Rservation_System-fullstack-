const API_ORIGIN = window.__API_ORIGIN__ || 'http://localhost:8000';
const ALLAUTH = `${API_ORIGIN}/_allauth/app/v1`;

/* ============================================================
   TOKEN STORAGE
   ============================================================ */

const Tokens = {
  get access() {
    return localStorage.getItem('access_token');
  },

  get refresh() {
    return localStorage.getItem('refresh_token');
  },

  get sessionToken() {
    return sessionStorage.getItem('allauth_session_token');
  },

  set(access, refresh) {
    if (access) localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  },

  session(token) {
    if (token) {
      sessionStorage.setItem('allauth_session_token', token);
    } else {
      sessionStorage.removeItem('allauth_session_token');
    }
  },

  // Full wipe — used when the refresh token itself is invalid/expired
  // (a failed silent-refresh attempt), NOT for a normal user sign-out.
  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    sessionStorage.removeItem('allauth_session_token');
    sessionStorage.removeItem('password_reset_email');
    sessionStorage.removeItem('password_reset_key');
  },

  // Sign-out — ends the LOCAL session only. Deliberately keeps
  // refresh_token in localStorage so the next "Sign in with Google"
  // can silently re-authenticate without reopening the Google popup
  // (which is what was forcing the picker + consent screen on every
  // single re-login). The refresh token still requires a live,
  // non-revoked Google grant to redeem — it does not bypass Google's
  // own security, it just avoids re-asking when nothing has changed.
  clearSession() {
    localStorage.removeItem('access_token');

    sessionStorage.removeItem('allauth_session_token');
    sessionStorage.removeItem('password_reset_email');
    sessionStorage.removeItem('password_reset_key');
  },


  /* app.js uses this name */
  isLoggedIn() {
    return !!this.access;
  },

  /* Keep compatibility if any code uses the old name */
  loggedIn() {
    return this.isLoggedIn();
  }
};


/* ============================================================
   HELPERS
   ============================================================ */

const csrf = () =>
  document.cookie
    .split('; ')
    .find(x => x.startsWith('csrftoken='))
    ?.split('=')[1] || '';

const json = async response => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};


/* ============================================================
   SAVE ALLAUTH TOKENS
   ============================================================ */

const saveTokens = response => {
  const meta = response?.meta || {};
  const data = response?.data || {};

  const access =
    meta.access_token ??
    data.access_token ??
    response?.access_token;

  const refresh =
    meta.refresh_token ??
    data.refresh_token ??
    response?.refresh_token;

  const session =
    meta.session_token ??
    data.session_token ??
    response?.session_token;

  if (access || refresh) {
    Tokens.set(access, refresh);
  }

  if (session !== undefined) {
    Tokens.session(session);
  }
};


/* ============================================================
   API FETCH
   ============================================================ */

async function apiFetch(url, opts = {}) {
  const {
    skipSessionToken = false,
    skipAuth = false,
    ...options
  } = opts;

  const isAllauth = url.includes('/_allauth/');

  const headers = {
    'Content-Type': 'application/json',
    'X-CSRFToken': csrf(),
    ...(options.headers || {})
  };

  /*
   * Application JWT is sent only to application APIs.
   *
   * NEVER send the Google OAuth token here.
   */
  if (
    !skipAuth &&
    Tokens.access &&
    !isAllauth
  ) {
    headers.Authorization = `Bearer ${Tokens.access}`;
  }

  /*
   * Allauth session token is sent only to allauth.
   */
  if (
    isAllauth &&
    Tokens.sessionToken &&
    !skipSessionToken
  ) {
    headers['X-Session-Token'] = Tokens.sessionToken;
  }

  let response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers
  });

  let data = await json(response);

  /*
   * allauth may return a session token.
   */
  if (data?.meta?.session_token !== undefined) {
    Tokens.session(data.meta.session_token);
  }

  /*
   * Refresh application JWT after a 401.
   */
  if (
    response.status === 401 &&
    Tokens.refresh &&
    !isAllauth &&
    !url.includes('/tokens/refresh') &&
    !skipAuth
  ) {
    const refreshed = await API.auth.refreshToken();

    if (refreshed.ok && Tokens.access) {
      headers.Authorization =
        `Bearer ${Tokens.access}`;

      response = await fetch(url, {
        credentials: 'include',
        ...options,
        headers
      });

      data = await json(response);
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


/* ============================================================
   API
   ============================================================ */

const API = {

  auth: {

    /* ========================================================
       SIGNUP
       ======================================================== */

    signup: ({
      email,
      password,
      full_name
    }) =>
      apiFetch(`${ALLAUTH}/auth/signup`, {
        method: 'POST',
        skipSessionToken: true,
        body: JSON.stringify({
          email,
          password,
          full_name
        })
      }),


    /* ========================================================
       LOGIN
       ======================================================== */

    async login({ email, password }) {
      const r = await apiFetch(
        `${ALLAUTH}/auth/login`,
        {
          method: 'POST',
          skipSessionToken: true,
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      if (r.ok) {
        saveTokens(r.data);
      }

      return r;
    },


    /* ========================================================
       EMAIL VERIFICATION
       ======================================================== */

    async verifyEmail(key) {
      const r = await apiFetch(
        `${ALLAUTH}/auth/email/verify`,
        {
          method: 'POST',
          skipSessionToken: true,
          body: JSON.stringify({ key })
        }
      );

      if (r.ok) {
        saveTokens(r.data);
        Tokens.session();
      }

      return r;
    },


    /* ========================================================
       RESEND EMAIL VERIFICATION
       ======================================================== */

    resendVerification: () =>
      apiFetch(
        `${ALLAUTH}/auth/email/verify/resend`,
        {
          method: 'POST'
        }
      ),


    /* ========================================================
       LOGOUT

       IMPORTANT: does NOT call DELETE /_allauth/app/v1/auth/session.

       That endpoint runs Django's adapter.logout(request), which
       flushes the server-side session — rotating the session key and
       wiping all session data, including headless_refresh_tokens.
       Once that happens, EVERY refresh token tied to this session is
       permanently unredeemable, regardless of rotation state or what
       we do with localStorage. That was the actual root cause of the
       "consent screen every single sign-in" bug: clearSession() tried
       to preserve refresh_token across sign-out, but the session
       backing it was already destroyed by this same call, so the
       preserved token was dead on arrival every time.

       Fix: sign-out is now purely local ("soft logout"). We drop the
       access token so the UI treats the user as signed out and any
       authenticated API call correctly gets a 401, but we deliberately
       do NOT touch the server-side session or the refresh token. That
       keeps the refresh token — and the session it depends on — alive
       for loginWithGoogle()'s silent-refresh attempt next time, which
       is what actually skips the picker/consent screen.

       Trade-off: the refresh token is not server-side revoked at
       sign-out; it remains valid until it naturally expires
       (HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN) or is silently rotated
       past. If you need a "sign out this device everywhere, right
       now" guarantee (e.g. shared/public computers, security-critical
       apps), call the session DELETE endpoint instead and accept that
       every sign-in will show the popup — that is the correct
       trade-off for that use case, not a bug to work around.
       ======================================================== */

    async logout() {
      Tokens.clearSession();

      return {
        ok: true,
        status: 200,
        data: { meta: { is_authenticated: false } }
      };
    },


    /* ========================================================
       PASSWORD RESET REQUEST
       ======================================================== */

    async requestPasswordReset(email) {
      email = String(email || '').trim();

      if (!email) {
        return {
          ok: false,
          status: 400,
          data: {
            errors: [{
              code: 'required',
              param: 'email',
              message: 'Email is required.'
            }]
          }
        };
      }

      const r = await apiFetch(
        `${ALLAUTH}/auth/password/request`,
        {
          method: 'POST',
          skipSessionToken: true,
          body: JSON.stringify({ email })
        }
      );

      const pending =
        r.data?.data?.flows?.some(
          f =>
            f.id === 'password_reset_by_code' &&
            f.is_pending
        );

      if (r.ok || pending) {
        sessionStorage.setItem(
          'password_reset_email',
          email
        );
      }

      return r;
    },


    /* ========================================================
       VERIFY PASSWORD RESET CODE
       ======================================================== */

    verifyPasswordResetCode: key =>
      apiFetch(
        `${ALLAUTH}/auth/password/reset`,
        {
          method: 'GET',
          skipSessionToken: true,
          headers: {
            'X-Password-Reset-Key':
              String(key || '').trim()
          }
        }
      ),


    /* ========================================================
       RESET PASSWORD
       ======================================================== */

    async resetPasswordByCode({
      key,
      password
    }) {
      key = String(key || '').trim();
      password = String(password || '');

      if (!key || !password) {
        const field = key ? 'password' : 'key';

        return {
          ok: false,
          status: 400,
          passwordReset: false,
          authenticated: false,
          data: {
            errors: [{
              code: 'required',
              param: field,
              message:
                `${field === 'key'
                  ? 'Reset code'
                  : 'Password'} is required.`
            }]
          }
        };
      }

      const r = await apiFetch(
        `${ALLAUTH}/auth/password/reset`,
        {
          method: 'POST',
          skipSessionToken: true,
          body: JSON.stringify({
            key,
            password
          })
        }
      );

      if (
        r.status === 200 ||
        r.status === 401
      ) {
        saveTokens(r.data);

        const authenticated =
          Tokens.isLoggedIn();

        sessionStorage.removeItem(
          'password_reset_email'
        );

        sessionStorage.removeItem(
          'password_reset_key'
        );

        return {
          ok: true,
          status: r.status,
          passwordReset: true,
          authenticated,
          data: r.data
        };
      }

      return {
        ok: false,
        status: r.status,
        passwordReset: false,
        authenticated: false,
        data: r.data
      };
    },


    /* ========================================================
       CHANGE PASSWORD
       ======================================================== */

    changePassword: ({
      current_password,
      new_password
    }) =>
      apiFetch(
        `${ALLAUTH}/account/password/change`,
        {
          method: 'POST',
          body: JSON.stringify({
            current_password,
            new_password
          })
        }
      ),


    /* ========================================================
       REFRESH TOKEN

       IN-FLIGHT GUARD: HEADLESS_JWT_ROTATE_REFRESH_TOKEN=True means
       every successful refresh invalidates the token it was called
       with and issues a new one — refresh tokens are single-use.
       If two callers both call refreshToken() before the first
       response lands (e.g. loginWithGoogle()'s pre-emptive silent
       refresh overlapping with apiFetch()'s 401 interceptor on page
       load), the second call sends a token the first call has
       already caused the server to invalidate — that 400s even
       though the token was completely valid when this function was
       entered. We fix this by sharing one in-flight promise across
       all concurrent callers, so only one POST /tokens/refresh is
       ever outstanding at a time and every caller gets that same
       result instead of racing.
       ======================================================== */

    _refreshInFlight: null,

    async refreshToken() {
      // Join the in-flight request instead of starting a new one.
      if (this._refreshInFlight) {
        return this._refreshInFlight;
      }

      this._refreshInFlight = this._doRefreshToken();

      try {
        return await this._refreshInFlight;
      } finally {
        this._refreshInFlight = null;
      }
    },

    async _doRefreshToken() {
      const refresh = Tokens.refresh;

      if (!refresh) {
        return {
          ok: false,
          status: 401,
          data: {
            detail:
              'No refresh token available.'
          }
        };
      }

      const response = await fetch(
        `${ALLAUTH}/tokens/refresh`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrf()
          },
          body: JSON.stringify({
            refresh_token: refresh
          })
        }
      );

      const data = await json(response);

      if (response.ok) {
        saveTokens(data);
      } else {
        // allauth's headless /tokens/refresh returns 400 (not 401)
        // for an invalid, expired, or already-rotated refresh token.
        // Clearing on any non-ok response is correct: a refresh token
        // that failed is not going to succeed on a later retry with
        // the exact same value.
        //
        // NOTE: this no longer means "show the popup forever." Since
        // logout() no longer destroys the server-side session (see
        // logout() above), this branch should now only fire when the
        // refresh token has genuinely expired
        // (HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN, default 7 days) or
        // the user revoked Google's grant — both of which correctly
        // require the popup.
        Tokens.clear();
      }

      return {
        ok: response.ok,
        status: response.status,
        data
      };
    },


    /* ========================================================
       GOOGLE LOGIN — Authorization Code Flow (popup)
       ========================================================

       WHAT THIS DOES:
         1. Opens a Google popup using GIS OAuth2 Code Client.
         2. Google shows the account picker (built-in to GIS popup).
         3. User picks an account → Google returns response.code.
         4. We POST { code } to our Django endpoint /api/auth/google/.
         5. Django exchanges the code server-side (client secret never
            leaves Django).
         6. Django returns the standard allauth JWT response.
         7. We call saveTokens() — same function used for email login.

       WHAT WE DO NOT DO:
         • We do NOT send the Google access token to Django.
         • We do NOT send the Google ID token to Django.
         • We do NOT use /_allauth/app/v1/auth/provider/token.
         • We do NOT expose GOOGLE_CLIENT_SECRET to JavaScript.

       HOW ACCOUNT SELECTION WORKS:
         google.accounts.oauth2.initCodeClient() always shows the
         Google account picker when the user clicks "Continue with Google".
         There is no auto_select in this flow — the account picker is
         always shown. This is by design in the GIS OAuth2 API.

       POPUP vs REDIRECT:
         ux_mode: 'popup' opens a small Google window. The user picks
         their account and grants consent if needed. The popup closes
         automatically. No page navigation occurs in the SPA.
       ======================================================== */

    async loginWithGoogle() {

      // ── Try silent refresh first ────────────────────────────────────
      // If we still hold a refresh_token from a prior Google login
      // (sign-out no longer wipes it — see Tokens.clearSession), redeem
      // it for a fresh access token WITHOUT touching Google's popup at
      // all. No picker, no consent screen, because nothing new is being
      // authorized — this is the same grant being renewed.
      //
      // Reuses the existing API.auth.refreshToken() (POST
      // /_allauth/app/v1/tokens/refresh per allauth's headless spec) —
      // it already reads Tokens.refresh itself, already calls
      // saveTokens() on success, and (as of the bugfix in refreshToken()
      // itself) now clears a dead token on ANY failure response — not
      // just 401. allauth was confirmed via direct curl to return 400,
      // not 401, for an invalid/expired/already-rotated refresh token;
      // the old 401-only check left dead tokens stuck in localStorage
      // forever, causing every later login to keep retrying the same
      // spent token instead of correctly falling back to the popup.
      //
      // Falls through to the full popup flow below if there's no
      // stored refresh token (refreshToken() returns ok:false
      // immediately in that case) or if the refresh attempt fails —
      // that case genuinely needs the user to re-authorize, so showing
      // the picker + consent screen there is correct, not a bug.
      if (Tokens.refresh) {
        const refreshed = await this.refreshToken();
        if (refreshed.ok) {
          return refreshed;
        }
      }

      return new Promise((resolve) => {

        const clientId = window.__GOOGLE_CLIENT_ID__;

        if (!clientId) {
          resolve({
            ok: false,
            status: 500,
            data: {
              detail: 'Google client ID is not configured.'
            }
          });
          return;
        }

        if (!window.google?.accounts?.oauth2) {
          resolve({
            ok: false,
            status: 500,
            data: {
              detail: 'Google Identity Services is not loaded. ' +
                      'Check that the GIS script tag is in index.html.'
            }
          });
          return;
        }

        // ── settled flag ──────────────────────────────────────────────────────────────────
        // Ensures the Promise resolves exactly once. safeResolve() ignores
        // duplicate calls (e.g. window focus fires then GIS callback fires late).
        let settled = false;

        const safeResolve = (value) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('focus', onWindowFocus);
          resolve(value);
        };

        // ── Window focus detection — cancel fallback, not primary signal ──────────
        //
        // PROBLEM: When the user clicks “Cancel” on Google’s consent screen,
        // GIS does NOT call the callback — the popup just closes silently.
        // Without another signal, the Promise hangs and the button stays stuck.
        //
        // WHY THE OLD 500ms DELAY WAS WRONG: GIS refocuses the OPENER window
        // the instant the user picks an account in the popup — well before the
        // consent screen finishes and the real callback fires with the code.
        // That refocus routinely takes longer than 500ms to turn into a
        // callback (network latency to Google, consent-screen render time),
        // so this listener was firing "cancelled" on successful logins, before
        // the real callback (which the `settled` guard then silently dropped).
        //
        // FIX: poll for `settled` for several seconds after focus returns,
        // instead of assuming 500ms is enough. Only resolve as cancelled if
        // GIS truly never calls back in that window (i.e. the popup is gone
        // and nothing is happening) — a real Cancel/Deny/✕ resolves almost
        // immediately since GIS has nothing left to send; a real login
        // resolves as soon as the code exchange with our backend completes.
        const FOCUS_CANCEL_GRACE_MS = 4000;
        const FOCUS_CANCEL_POLL_MS = 150;

        const onWindowFocus = () => {
          const deadline = Date.now() + FOCUS_CANCEL_GRACE_MS;
          const poll = () => {
            if (settled) return; // real callback (success or error) won the race
            if (Date.now() >= deadline) {
              safeResolve({
                ok: false,
                cancelled: true,
                status: 400,
                data: { detail: 'Google sign-in was cancelled.' }
              });
              return;
            }
            setTimeout(poll, FOCUS_CANCEL_POLL_MS);
          };
          poll();
        };

        setTimeout(() => {
          window.addEventListener('focus', onWindowFocus, { once: true });
        }, 300);

        const client = google.accounts.oauth2.initCodeClient({
          client_id: clientId,

          // openid  → OIDC; gives us "sub" (stable Google user ID)
          // email   → email address
          // profile → name, picture
          scope: 'openid email profile',

          // Popup UX: small overlay window, no page navigation.
          ux_mode: 'popup',

          // Show the account picker so users can choose which Google account
          // to use, WITHOUT forcing the consent screen on every single login.
          // 'select_account' alone shows the picker; omitting 'consent' lets
          // Google skip re-asking for permission once the user has already
          // granted it for this app. (The old 'select_account consent' value
          // forced full re-consent every time — that was the actual cause of
          // "select account and consent shows every time".)
          prompt: 'select_account',

          callback: async (response) => {
            // Guard: ignore late / duplicate callback fires.
            if (settled) return;

            // response.code is the authorization code from Google.
            // It is NOT an access token or ID token.
            // It is a one-time-use short-lived code that only Django
            // can exchange for real tokens (using the client secret).

            if (response.error) {
              // Google returned an error. Covers all ways a user can
              // dismiss the popup or consent screen:
              //   popup_closed_by_user  – user closed the popup window
              //   access_denied         – user clicked "Deny"
              //   user_cancel           – user clicked "Cancel" on the
              //                          new consent screen
              //   cancelled             – generic GIS cancel signal
              //   popup_blocked         – browser blocked the popup
              const isCancelled =
                response.error === 'popup_closed_by_user' ||
                response.error === 'access_denied'        ||
                response.error === 'user_cancel'          ||
                response.error === 'cancelled'            ||
                response.error === 'popup_blocked';

              safeResolve({
                ok: false,
                cancelled: isCancelled,
                status: 400,
                data: {
                  error: response.error,
                  detail: isCancelled
                    ? 'Google sign-in was cancelled.'
                    : `Google error: ${response.error}`
                }
              });
              return;
            }

            if (!response?.code) {
              safeResolve({
                ok: false,
                status: 400,
                data: {
                  detail: 'Google did not return an authorization code.'
                }
              });
              return;
            }

            try {
              // POST { code } to our Django endpoint.
              // Django exchanges it server-side using the client secret.
              const result = await apiFetch(
                `${API_ORIGIN}/api/auth/google/`,
                {
                  method: 'POST',
                  skipAuth: true,         // No JWT needed (not logged in yet)
                  skipSessionToken: true, // No allauth session token yet
                  body: JSON.stringify({
                    code: response.code   // Authorization code, NOT a token
                  })
                }
              );

              console.log(
                '[Google] /api/auth/google/ →',
                result.status,
                result.data
              );

              if (!result.ok) {
                safeResolve(result);
                return;
              }

              // Django returned the standard allauth JWT response:
              // { status: 200, data: { user: {...}, methods: [...] },
              //   meta: { access_token: "eyJ...", refresh_token: "eyJ...",
              //           is_authenticated: true } }
              //
              // saveTokens() reads meta.access_token and meta.refresh_token.
              // This is the same function used for email/password login.
              saveTokens(result.data);

              safeResolve({
                ok: true,
                status: result.status,
                data: result.data
              });

            } catch (networkError) {
              console.error('[Google] Network error:', networkError);
              safeResolve({
                ok: false,
                status: 500,
                data: {
                  detail: networkError.message || 'Network error during Google sign-in.'
                }
              });
            }
          }
        });

        // requestCode() MUST be called synchronously inside the user's
        // click handler. Calling it asynchronously (e.g., after an
        // await) causes browsers to block the popup as a popup blocker
        // violation because it's no longer a direct result of a user gesture.
        client.requestCode();
      });
    }
  },


  /* ==========================================================
     APPLICATION API
     ========================================================== */

  getMe: () =>
    apiFetch(`${API_ORIGIN}/api/me/`),

  getProfile: () =>
    apiFetch(
      `${API_ORIGIN}/api/me/profile/update/`
    ),

  async updateProfile(formData) {
    const headers = {};

    if (Tokens.access) {
      headers.Authorization =
        `Bearer ${Tokens.access}`;
    }

    const response = await fetch(
      `${API_ORIGIN}/api/me/profile/update/`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: formData
      }
    );

    return {
      ok: response.ok,
      status: response.status,
      data: await json(response)
    };
  }
};


/* ============================================================
   GLOBAL
   ============================================================ */

window.API = API;
window.Tokens = Tokens;