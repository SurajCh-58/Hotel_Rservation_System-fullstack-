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

  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

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
   * DO NOT send the Google OAuth access token here.
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
       ======================================================== */

    async logout() {
      const r = await apiFetch(
        `${ALLAUTH}/auth/session`,
        {
          method: 'DELETE'
        }
      );

      Tokens.clear();

      return r;
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
       ======================================================== */

    async refreshToken() {
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
      } else if (response.status === 401) {
        Tokens.clear();
      }

      return {
        ok: response.ok,
        status: response.status,
        data
      };
    },


    /* ========================================================
       GOOGLE LOGIN
       ======================================================== */

    loginWithGoogle() {
      return new Promise((resolve, reject) => {

        const oauth =
          window.google?.accounts?.oauth2;

        if (!oauth) {
          reject(
            new Error(
              'Google Identity Services SDK is not loaded.'
            )
          );
          return;
        }

        const clientId =
          window.__GOOGLE_CLIENT_ID__;

        if (!clientId) {
          reject(
            new Error(
              'Google client ID is not configured.'
            )
          );
          return;
        }

        const client = oauth.initTokenClient({
          client_id: clientId,

          /*
           * Google OAuth scopes.
           */
          scope: 'openid email profile',

          /*
           * Ask Google to let the user choose an account
           * and request consent.
           */
          prompt: 'select_account consent',

          callback: async token => {

            if (token.error) {
              resolve({
                cancelled: true,
                error: token.error
              });
              return;
            }

            if (!token.access_token) {
              resolve({
                ok: false,
                data: {
                  detail:
                    'Google did not return an access token.'
                }
              });
              return;
            }

            try {

              /*
               * IMPORTANT:
               *
               * This is the GOOGLE access token.
               *
               * It is sent ONLY to allauth.
               *
               * It is NOT saved into Tokens.access.
               */
              const r = await apiFetch(
      `${ALLAUTH}/auth/provider/token`,
      {
     method: 'POST',
     skipAuth: true,
     skipSessionToken: true,
     body: JSON.stringify({
      provider: 'google',
      process: 'login',
      callback_url: window.location.origin + '/auth/callback',
      token: {
        client_id: clientId,              // <--- Must include this field
        access_token: tokenResponse.access_token // or id_token
      }
      })
    }
);

              console.log(
                'Google → allauth:',
                r.status,
                r.data
              );


              /* ------------------------------------------
                 SUCCESS
                 ------------------------------------------ */

              if (r.ok) {
                saveTokens(r.data);

                resolve({
                  ok: true,
                  data: r.data
                });

                return;
              }


              /* ------------------------------------------
                 PROVIDER SIGNUP
                 ------------------------------------------ */

              const flows =
                r.data?.data?.flows || [];

              if (
                flows.some(
                  f =>
                    f.id === 'provider_signup' &&
                    f.is_pending
                )
              ) {
                resolve({
                  ok: false,
                  pendingSignup: true,
                  data: r.data
                });

                return;
              }


              /* ------------------------------------------
                 EMAIL VERIFICATION
                 ------------------------------------------ */

              if (
                flows.some(
                  f =>
                    f.id === 'verify_email' &&
                    f.is_pending
                )
              ) {
                saveTokens(r.data);

                resolve({
                  ok: false,
                  pendingEmail: true,
                  data: r.data
                });

                return;
              }


              /* ------------------------------------------
                 OTHER ERROR
                 ------------------------------------------ */

              resolve({
                ok: false,
                status: r.status,
                data: r.data
              });

            } catch (error) {

              console.error(
                'Google authentication error:',
                error
              );

              resolve({
                ok: false,
                data: {
                  detail: error.message
                }
              });
            }
          }
        });

        client.requestAccessToken();
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