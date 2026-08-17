/* ============================================================
   api.js – All API calls to the HotelReservation Django backend

   AUTH FLOWS
   ============================================================

   SIGNUP
   ------
   POST /_allauth/app/v1/auth/signup
        ↓
   pending verify_email
        ↓
   POST /_allauth/app/v1/auth/email/verify
        ↓
   JWT access + refresh


   PASSWORD RESET
   --------------
   POST /_allauth/app/v1/auth/password/request
        ↓
   401 + password_reset_by_code pending
        ↓ allauth saves session_token in meta → stored in sessionStorage
   user receives OTP
        ↓
   POST /_allauth/app/v1/auth/password/reset
   X-Session-Token: <token from above>
   {
     "key": "123456",
     "password": "new-password"
   }
        ↓
   200 = password changed + logged in
   401 = password changed + NOT logged in  (ACCOUNT_LOGIN_ON_PASSWORD_RESET=False)
        ↓
   frontend sends user to login

   NOTE: The GET /auth/password/reset step has been intentionally removed.
   It consumed one of the 5 allowed OTP attempts without changing any state.
   The POST validates the key itself and returns 400 token_invalid on failure.

   IMPORTANT
   ---------
   Email verification and resend are intentionally unchanged.
   ============================================================ */


const BASE = '';

const ALLAUTH = '/_allauth/app/v1';


// ════════════════════════════════════════════════════════════
// TOKEN HELPERS
// ════════════════════════════════════════════════════════════

const Tokens = {

  get access() {

    return localStorage.getItem(
      'access_token'
    );

  },


  get refresh() {

    return localStorage.getItem(
      'refresh_token'
    );

  },


  get sessionToken() {

    return sessionStorage.getItem(
      'allauth_session_token'
    );

  },


  set(
    access,
    refresh
  ) {

    if (access) {

      localStorage.setItem(
        'access_token',
        access
      );

    }


    if (refresh) {

      localStorage.setItem(
        'refresh_token',
        refresh
      );

    }

  },


  setSession(token) {

    if (token) {

      sessionStorage.setItem(
        'allauth_session_token',
        token
      );

    } else {

      sessionStorage.removeItem(
        'allauth_session_token'
      );

    }

  },


  clear() {

    localStorage.removeItem(
      'access_token'
    );


    localStorage.removeItem(
      'refresh_token'
    );


    sessionStorage.removeItem(
      'allauth_session_token'
    );


    sessionStorage.removeItem(
      'password_reset_email'
    );


    sessionStorage.removeItem(
      'password_reset_key'
    );

  },


  isLoggedIn() {

    return !!this.access;

  }

};


// ════════════════════════════════════════════════════════════
// CSRF HELPER
// ════════════════════════════════════════════════════════════

function getCsrfToken() {

  return document.cookie
    .split('; ')
    .find(
      row =>
        row.startsWith(
          'csrftoken='
        )
    )
    ?.split('=')[1] ?? '';

}


// ════════════════════════════════════════════════════════════
// CORE FETCH WRAPPER
// ════════════════════════════════════════════════════════════

async function apiFetch(
  url,
  options = {}
) {

  /*
   * Internal frontend option.
   *
   * Prevents the signup/allauth session token from
   * being sent to independent password-reset requests.
   */

  const {
    skipSessionToken = false,
    ...fetchOptions
  } = options;


  const headers = {

    'Content-Type':
      'application/json',

    'X-CSRFToken':
      getCsrfToken(),

    ...(fetchOptions.headers || {})

  };


  // ──────────────────────────────────────────────────────────
  // JWT ACCESS TOKEN
  // ──────────────────────────────────────────────────────────

  if (
    Tokens.access
  ) {

    headers['Authorization'] =
      `Bearer ${Tokens.access}`;

  }


  // ──────────────────────────────────────────────────────────
  // ALLAUTH SESSION TOKEN
  // ──────────────────────────────────────────────────────────

  if (
    Tokens.sessionToken &&
    !skipSessionToken
  ) {

    headers['X-Session-Token'] =
      Tokens.sessionToken;

  }


  const res =
    await fetch(
      url,
      {
        credentials: 'include',
        ...fetchOptions,
        headers
      }
    );


  // ──────────────────────────────────────────────────────────
  // PARSE RESPONSE
  // ──────────────────────────────────────────────────────────

  let data = null;


  try {

    data =
      await res.json();

  } catch (_) {

    data = null;

  }


  // ──────────────────────────────────────────────────────────
  // SAVE ALLAUTH SESSION TOKEN
  // ──────────────────────────────────────────────────────────

  if (
    data?.meta?.session_token !== undefined
  ) {

    Tokens.setSession(
      data.meta.session_token
    );

  }


  // ──────────────────────────────────────────────────────────
  // AUTO REFRESH JWT
  //
  // Do not refresh allauth endpoints.
  // Their 401 responses can be intentional.
  // ──────────────────────────────────────────────────────────

  const isAllauthEndpoint =
    url.includes(
      '/_allauth/'
    );


  if (
    res.status === 401 &&
    Tokens.refresh &&
    !url.includes(
      'token/refresh'
    ) &&
    !isAllauthEndpoint
  ) {

    const refreshed =
      await API.auth.refreshToken();


    if (
      refreshed.ok
    ) {

      const retryHeaders = {

        ...headers,

        'Authorization':
          `Bearer ${Tokens.access}`

      };


      const retry =
        await fetch(
          url,
          {
            credentials: 'include',
            ...fetchOptions,
            headers: retryHeaders
          }
        );


      let retryData = null;


      try {

        retryData =
          await retry.json();

      } catch (_) {}


      return {

        ok:
          retry.ok,

        status:
          retry.status,

        data:
          retryData

      };

    }

  }


  return {

    ok:
      res.ok,

    status:
      res.status,

    data

  };

}


// ════════════════════════════════════════════════════════════
// API
// ════════════════════════════════════════════════════════════

const API = {


  // ══════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════

  auth: {


    // ────────────────────────────────────────────────────────
    // SIGN UP
    // ────────────────────────────────────────────────────────

    async signup({
      email,
      password,
      full_name
    }) {

      return apiFetch(
        `${ALLAUTH}/auth/signup`,
        {

          method: 'POST',

          body:
            JSON.stringify({

              email,

              password,

              full_name

            })

        }
      );

    },


    // ────────────────────────────────────────────────────────
    // LOGIN
    // ────────────────────────────────────────────────────────

    async login({
      email,
      password
    }) {

      const res =
        await apiFetch(
          `${ALLAUTH}/auth/login`,
          {

            method: 'POST',

            body:
              JSON.stringify({

                email,

                password

              })

          }
        );


      if (
        res.ok
      ) {

        Tokens.set(

          res.data
            ?.meta
            ?.access_token,

          res.data
            ?.meta
            ?.refresh_token

        );

      }


      return res;

    },


    // ────────────────────────────────────────────────────────
    // VERIFY EMAIL OTP
    //
    // DO NOT CHANGE.
    // ────────────────────────────────────────────────────────

    async verifyEmail(code) {

      const res =
        await apiFetch(
          `${ALLAUTH}/auth/email/verify`,
          {

            method: 'POST',

            body:
              JSON.stringify({

                key:
                  code

              })

          }
        );


      if (
        res.ok
      ) {

        Tokens.set(

          res.data
            ?.meta
            ?.access_token,

          res.data
            ?.meta
            ?.refresh_token

        );


        Tokens.setSession(
          null
        );

      }


      return res;

    },


    // ────────────────────────────────────────────────────────
    // RESEND EMAIL VERIFICATION
    //
    // DO NOT CHANGE.
    // ────────────────────────────────────────────────────────

    async resendVerification() {

      return apiFetch(
        `${ALLAUTH}/auth/email/verify/resend`,
        {

          method: 'POST'

        }
      );

    },


    // ────────────────────────────────────────────────────────
    // LOGOUT
    // ────────────────────────────────────────────────────────

    async logout() {

      const res =
        await apiFetch(
          `${ALLAUTH}/auth/logout`,
          {

            method: 'DELETE'

          }
        );


      Tokens.clear();


      return res;

    },


    // ════════════════════════════════════════════════════════
    // PASSWORD RESET
    // ════════════════════════════════════════════════════════


    // ────────────────────────────────────────────────────────
    // REQUEST PASSWORD RESET
    // ────────────────────────────────────────────────────────

    async requestPasswordReset(
      email
    ) {

      const cleanEmail =
        String(
          email || ''
        ).trim();


      if (
        !cleanEmail
      ) {

        return {

          ok: false,

          status: 400,

          data: {

            errors: [

              {

                code:
                  'required',

                param:
                  'email',

                message:
                  'Email is required.'

              }

            ]

          }

        };

      }


      /*
       * Password reset is independent from signup
       * email verification.
       *
       * Do NOT send X-Session-Token.
       */

      const res =
        await apiFetch(
          `${ALLAUTH}/auth/password/request`,
          {

            method: 'POST',

            skipSessionToken: true,

            body:
              JSON.stringify({

                email:
                  cleanEmail

              })

          }
        );


      /*
       * When password reset by code is enabled,
       * allauth may return 401 with a pending flow.
       *
       * That means the reset flow has started.
       */

      const pending =
        res.data?.data?.flows?.some(
          flow =>
            flow.id ===
              'password_reset_by_code' &&
            flow.is_pending
        );


      if (
        res.ok ||
        pending
      ) {

        sessionStorage.setItem(
          'password_reset_email',
          cleanEmail
        );

      }


      return res;

    },


    // ────────────────────────────────────────────────────────
    // VERIFY PASSWORD RESET CODE (OTP)
    //
    // GET /auth/password/reset
    // Header: X-Password-Reset-Key: <6-digit code>
    //         X-Session-Token: <token from /password/request 401>
    //
    // Returns:
    //   200 → code is valid, user info returned
    //   400 → code is wrong (token_invalid) — attempt used
    //   409 → no pending flow (session expired)
    //
    // This is the correct way to verify the OTP before showing
    // the password fields. It does consume one attempt, which is
    // intentional — wrong guesses should cost attempts.
    // ────────────────────────────────────────────────────────

    async verifyPasswordResetCode(key) {

      const cleanKey =
        String(key || '').trim();

      console.log(
        '[AUTH] VERIFY RESET CODE:',
        { key: cleanKey }
      );

      return apiFetch(
        `${ALLAUTH}/auth/password/reset`,
        {
          method: 'GET',
          headers: {
            'X-Password-Reset-Key': cleanKey
          }
        }
      );

    },


    // ────────────────────────────────────────────────────────
    // RESET PASSWORD
    //
    // POST:
    //
    // {
    //   "key": "123456",
    //   "password": "new-password"
    // }
    //
    // IMPORTANT:
    //
    // X-Session-Token MUST be sent here (not skipped).
    //
    // The password_reset_by_code flow is stateful — allauth
    // needs the session token from the 401 returned by
    // POST /auth/password/request to locate the pending flow.
    // Without it, allauth returns 409 (no pending flow).
    //
    // allauth can return:
    //
    // 200 = password reset + authenticated
    //
    // 401 = password reset + NOT authenticated
    //       (ACCOUNT_LOGIN_ON_PASSWORD_RESET = False, default)
    //
    // Therefore a 401 from this endpoint is NOT automatically
    // a password-reset failure.
    // ────────────────────────────────────────────────────────

    async resetPasswordByCode({
      key,
      password
    }) {

      const cleanKey =
        String(
          key || ''
        ).trim();


      const cleanPassword =
        String(
          password || ''
        );


      console.log(
        '[AUTH] RESET PASSWORD REQUEST:',
        {
          key:
            cleanKey
        }
      );


      if (
        !cleanKey
      ) {

        return {

          ok: false,

          status: 400,

          passwordReset: false,

          authenticated: false,

          data: {

            errors: [

              {

                code:
                  'required',

                param:
                  'key',

                message:
                  'Reset code is required.'

              }

            ]

          }

        };

      }


      if (
        !cleanPassword
      ) {

        return {

          ok: false,

          status: 400,

          passwordReset: false,

          authenticated: false,

          data: {

            errors: [

              {

                code:
                  'required',

                param:
                  'password',

                message:
                  'Password is required.'

              }

            ]

          }

        };

      }


      const res =
        await apiFetch(
          `${ALLAUTH}/auth/password/reset`,
          {

            method: 'POST',

            // DO NOT set skipSessionToken here.
            // The password_reset_by_code flow is stateful.
            // allauth needs X-Session-Token (from the 401
            // returned by /password/request) to find the
            // pending flow. Skipping it causes a 409.

            body:
              JSON.stringify({

                key:
                  cleanKey,

                password:
                  cleanPassword

              })

          }
        );


      console.log(
        '[AUTH] RESET PASSWORD RAW RESPONSE:',
        res
      );


      /*
       * ======================================================
       * ALLAUTH PASSWORD RESET RESULT
       * ======================================================
       *
       * According to the endpoint documentation supplied:
       *
       * 200:
       *   Password changed and user authenticated.
       *
       * 401:
       *   Password changed but user needs to log in.
       *
       * 400:
       *   Input/reset-key/password error.
       *
       * Therefore:
       *
       * 200 OR 401 = successful password reset.
       */

      if (
        res.status === 200 ||
        res.status === 401
      ) {

        /*
         * If tokens were supplied, store them.
         */

        Tokens.set(

          res.data
            ?.meta
            ?.access_token,

          res.data
            ?.meta
            ?.refresh_token

        );


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

          status:
            res.status,

          passwordReset:
            true,

          authenticated:
            authenticated,

          data:
            res.data

        };

      }


      /*
       * Actual reset failure.
       */

      return {

        ok: false,

        status:
          res.status,

        passwordReset:
          false,

        authenticated:
          false,

        data:
          res.data

      };

    },


    // ────────────────────────────────────────────────────────
    // CHANGE PASSWORD
    // ────────────────────────────────────────────────────────

    async changePassword({
      current_password,
      new_password
    }) {

      return apiFetch(
        `${ALLAUTH}/auth/password/change`,
        {

          method: 'POST',

          body:
            JSON.stringify({

              current_password,

              new_password

            })

        }
      );

    },


    // ────────────────────────────────────────────────────────
    // REFRESH JWT
    // ────────────────────────────────────────────────────────

    async refreshToken() {

      const refresh =
        Tokens.refresh;


      if (
        !refresh
      ) {

        return {

          ok: false,

          status: 401,

          data: {

            detail:
              'No refresh token available.'

          }

        };

      }


      const csrf =
        getCsrfToken();


      const res =
        await fetch(
          `${ALLAUTH}/auth/token/refresh`,
          {

            method: 'POST',

            credentials:
              'include',

            headers: {

              'Content-Type':
                'application/json',

              'X-CSRFToken':
                csrf

            },

            body:
              JSON.stringify({

                refresh

              })

          }
        );


      let data = null;


      try {

        data =
          await res.json();

      } catch (_) {}


      const result = {

        ok:
          res.ok,

        status:
          res.status,

        data

      };


      if (
        res.ok
      ) {

        Tokens.set(

          data
            ?.meta
            ?.access_token,

          data
            ?.meta
            ?.refresh_token

        );

      }


      return result;

    },

    loginWithGoogle() {

      return new Promise(
        (resolve, reject) => {

          const clientId =
            window.__GOOGLE_CLIENT_ID__;


          if (!clientId) {

            return reject(
              new Error(
                'Google Client ID is not configured.'
              )
            );

          }


          // Check GIS library is loaded
          if (
            typeof google === 'undefined' ||
            !google?.accounts?.id
          ) {

            return reject(
              new Error(
                'Google Sign-In library failed to load. Check your internet connection.'
              )
            );

          }


          // One-tap / popup credential callback
          google.accounts.id.initialize({

            client_id:
              clientId,

            callback:
              async (response) => {

                try {

                  if (!response?.credential) {

                    // User closed the popup without signing in
                    return resolve({ cancelled: true });

                  }


                  console.log(
                    '[AUTH] Google id_token received, sending to allauth'
                  );


                  const res =
                    await apiFetch(
                      `${ALLAUTH}/auth/provider/token`,
                      {
                        method: 'POST',

                        // skipSessionToken: true so a stale
                        // session token from another flow
                        // doesn't accidentally get sent
                        skipSessionToken: true,

                        body: JSON.stringify({

                          provider: 'google',

                          process: 'login',

                          token: {
                            client_id:
                              clientId,
                            id_token:
                              response.credential
                          }

                        })
                      }
                    );


                  console.log(
                    '[AUTH] provider/token response:',
                    res
                  );


                  if (res.status === 200) {

                    // Fully authenticated — store JWT tokens
                    Tokens.set(
                      res.data?.meta?.access_token,
                      res.data?.meta?.refresh_token
                    );

                    return resolve({
                      ok: true,
                      data: res.data
                    });

                  }


                  if (res.status === 401) {

                    // Pending step — check which flow
                    const flows =
                      res.data?.data?.flows || [];

                    const pendingSignup =
                      flows.find(
                        f =>
                          f.id === 'provider_signup' &&
                          f.is_pending
                      );

                    const pendingEmail =
                      flows.find(
                        f =>
                          f.id === 'verify_email' &&
                          f.is_pending
                      );


                    if (pendingSignup || pendingEmail) {

                      // Store session token for the pending flow
                      if (res.data?.meta?.session_token) {

                        Tokens.setSession(
                          res.data.meta.session_token
                        );

                      }

                    }


                    return resolve({
                      ok: false,
                      pending: true,
                      pendingSignup: !!pendingSignup,
                      pendingEmail: !!pendingEmail,
                      data: res.data
                    });

                  }


                  // 400, 403, or other error
                  return resolve({
                    ok: false,
                    status: res.status,
                    data: res.data
                  });


                } catch (err) {

                  reject(err);

                }

              },

            // Cancel the One Tap UI after 3 seconds if not interacted with
            cancel_on_tap_outside: true,

            use_fedcm_for_prompt: false

          });


          // Prompt the One Tap / Sign-In popup
          google.accounts.id.prompt(
            (notification) => {

              if (
                notification.isNotDisplayed() ||
                notification.isSkippedMoment()
              ) {

                // One Tap was suppressed (user dismissed, browser blocked it, etc.)
                // Fall back to the explicit sign-in button via renderButton
                // so the user always has a path to sign in.
                console.log(
                  '[AUTH] One Tap suppressed:',
                  notification.getNotDisplayedReason?.() ||
                  notification.getSkippedReason?.()
                );


                // Resolve as cancelled — handleGoogleLogin will
                // show the error from the button click path instead
                resolve({ cancelled: true });

              }

            }
          );

        }
      );

    }

  },


  // ══════════════════════════════════════════════════════════
  // PROFILE
  // ══════════════════════════════════════════════════════════

  async getMe() {

    return apiFetch(
      `${BASE}/api/me/`
    );

  },


  async getProfile() {

    return apiFetch(
      `${BASE}/api/me/profile/update/`
    );

  },


  async updateProfile(
    formData
  ) {

    const headers = {};


    if (
      Tokens.access
    ) {

      headers['Authorization'] =
        `Bearer ${Tokens.access}`;

    }


    /*
     * Do NOT set Content-Type.
     *
     * Browser sets multipart/form-data boundary.
     */

    const res =
      await fetch(
        `${BASE}/api/me/profile/update/`,
        {

          method: 'PATCH',

          credentials:
            'include',

          headers,

          body:
            formData

        }
      );


    let data = null;


    try {

      data =
        await res.json();

    } catch (_) {}


    return {

      ok:
        res.ok,

      status:
        res.status,

      data

    };

  }

};

// ════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ════════════════════════════════════════════════════════════

window.API =
  API;


window.Tokens =
  Tokens;