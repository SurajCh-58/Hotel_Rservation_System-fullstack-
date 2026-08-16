/* ============================================================
    app.js – UI logic for HotelReservation frontend

    SIGNUP → OTP VERIFICATION → AUTO-LOGIN FLOW
    ─────────────────────────────────────────────
    ① User fills the register form and clicks "Create Account"
      • allauth creates the user (inactive until verified)
      • allauth sends a 6-digit OTP to the email
      • Backend responds 401 + { meta.session_token, data.flows }
    ③ Frontend detects isPendingVerification → goAuth('verify-email')
    ④ User enters the 6-digit OTP in the boxes and clicks "Verify"
    ⑤ btn-verify-email click handler calls API.auth.verifyEmail(code)
      • Request carries X-Session-Token header (set by apiFetch)
      • allauth validates the OTP
      • Backend responds 200 + { meta.access_token, meta.refresh_token }
    ⑥ Tokens stored in localStorage → showApp() called → user is in!
    ============================================================ */

// ── Toast notifications ─────────────────────────────────────
const Toast = {
  container: null,
  init() { this.container = document.getElementById('toast-container'); },
  show(msg, type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${msg}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
    this.container.appendChild(toast);
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 250);
      }, duration);
    }
  },
};

// ── Router ──────────────────────────────────────────────────
const Router = {
  current: null,

  go(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const view    = document.getElementById(`view-${viewId}`);
    const navLink = document.querySelector(`[data-view="${viewId}"]`);
    if (view)    view.classList.add('active');
    if (navLink) navLink.classList.add('active');
    this.current = viewId;

    const titles = {
      dashboard:          ['Dashboard',       'Welcome back!'],
      profile:            ['My Profile',      'View & manage your profile'],
      'edit-profile':     ['Edit Profile',    'Update your profile information'],
      'change-password':  ['Change Password', 'Update your account password'],
      endpoints:          ['API Explorer',    'Test all backend endpoints directly'],
    };
    const [title, sub] = titles[viewId] || ['', ''];
    document.getElementById('topbar-title').textContent    = title;
    document.getElementById('topbar-subtitle').textContent = sub;

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  },

  goAuth(authView) {
    // handled by the inline script override at the bottom of index.html
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`auth-${authView}`);
    if (view) view.classList.add('active');
  },
};

// ── App state ───────────────────────────────────────────────
const State = {
  user:       null,
  resetEmail: '',
};

// ── Auth shell toggle ───────────────────────────────────────
function showApp() {
  document.getElementById('auth-shell').style.display = 'none';
  document.getElementById('app-shell').style.display  = 'flex';
  Router.go('dashboard');
  loadMe();
}

function showAuth(view = 'login') {
  document.getElementById('auth-shell').style.display = 'flex';
  document.getElementById('app-shell').style.display  = 'none';
  Router.goAuth(view);
}

// ── Load current user ───────────────────────────────────────
async function loadMe() {
  const res = await API.getMe();
  if (res.ok) {
    State.user = res.data;
    renderUserInfo(res.data);
  } else if (res.status === 401) {
    showAuth('login');
  }
}

function renderUserInfo(user) {
  const initials = (user.full_name || user.email || 'U').substring(0, 2).toUpperCase();
  const imageUrl = user.profiles?.image || null;

  // Sidebar mini user
  const miniAvatar = document.getElementById('mini-avatar');
  miniAvatar.textContent = initials;
  if (imageUrl) miniAvatar.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
  document.getElementById('mini-name').textContent  = user.full_name || '—';
  document.getElementById('mini-email').textContent = user.email || '';

  // Dashboard
  document.getElementById('dash-name').textContent  = user.full_name || '—';
  document.getElementById('dash-email').textContent = user.email || '';
  document.getElementById('dash-phone').textContent = user.profiles?.phone || 'Not set';
  document.getElementById('dash-id').textContent    = `#${user.id}`;
  const dashAvatar = document.getElementById('dash-avatar');
  dashAvatar.textContent = initials;
  if (imageUrl) dashAvatar.innerHTML = `<img src="${imageUrl}" alt="avatar">`;

  // Profile view
  document.getElementById('profile-name').textContent  = user.full_name || '—';
  document.getElementById('profile-email').textContent = user.email || '';
  document.getElementById('profile-phone').textContent = user.profiles?.phone || 'Not set';
  document.getElementById('profile-id').textContent    = `#${user.id}`;
  const profAvatar = document.getElementById('profile-avatar');
  profAvatar.textContent = initials;
  if (imageUrl) profAvatar.innerHTML = `<img src="${imageUrl}" alt="avatar">`;

  // Edit form defaults
  document.getElementById('edit-phone').value = user.profiles?.phone || '';
  const editPreview = document.getElementById('edit-avatar-preview');
  editPreview.textContent = initials;
  if (imageUrl) editPreview.innerHTML = `<img src="${imageUrl}" alt="avatar">`;
}

// ── UI helpers ──────────────────────────────────────────────
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
}

function showAlert(containerId, msg, type = 'error') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const icons = { error: '⚠️', success: '✅', info: 'ℹ️' };
  el.className  = `alert alert-${type}`;
  el.innerHTML  = `<span class="alert-icon">${icons[type]}</span><span>${msg}</span>`;
  el.style.display = 'flex';
}

function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.style.display = 'none';
}

function extractError(data) {
  if (!data) return 'Something went wrong. Please try again.';
  if (typeof data === 'string') return data;

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map(e => {
      const friendly = {
        email_taken:                 'This email is already registered.',
        password_too_short:        'Password is too short (minimum 8 characters).',
        password_too_common:       'This password is too common. Choose a stronger one.',
        password_too_similar:      'Password is too similar to your email.',
        password_entirely_numeric: 'Password cannot be entirely numbers.',
        required:    e.param ? `${e.param.replace(/_/g, ' ')} is required.` : 'This field is required.',
        enter_email: 'Please enter a valid email address.',
        invalid:     e.param ? `Invalid ${e.param.replace(/_/g, ' ')}.` : 'Invalid input.',
        incorrect_code: 'The code is incorrect or has expired. Try again.',
      };
      return friendly[e.code] || e.message || 'Unknown error.';
    }).join(' ');
  }

  if (data.detail)           return data.detail;
  if (data.non_field_errors)  return data.non_field_errors.join(' ');

  const vals = Object.values(data).flat().filter(v => typeof v === 'string');
  if (vals.length) return vals.join(' ');

  return 'Something went wrong. Please try again.';
}

// ── OTP input helpers ───────────────────────────────────────
function setupOtpInputs(containerId) {
  const inputs = document.querySelectorAll(`#${containerId} .otp-input`);
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g, '');
      e.target.value = v.slice(-1);
      if (v && i < inputs.length - 1) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '');
      inputs.forEach((el, j) => { el.value = paste[j] || ''; });
      if (paste.length >= inputs.length) inputs[inputs.length - 1].focus();
    });
  });
}

function getOtpValue(containerId) {
  return [...document.querySelectorAll(`#${containerId} .otp-input`)]
    .map(i => i.value).join('');
}

function clearOtp(containerId) {
  document.querySelectorAll(`#${containerId} .otp-input`).forEach(i => i.value = '');
  document.querySelector(`#${containerId} .otp-input`)?.focus();
}

// ════════════════════════════════════════════════════════════
// AUTH HANDLERS
// ════════════════════════════════════════════════════════════

/* ── ① SIGN UP ──────────────────────────────────────────── */
document.getElementById('form-register')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('reg-alert');

  const email     = document.getElementById('reg-email').value.trim();
  const full_name = document.getElementById('reg-name').value.trim();
  const password  = document.getElementById('reg-password').value;
  const confirm   = document.getElementById('reg-confirm').value;

  // Client-side validation
  if (!full_name)                      return showAlert('reg-alert', 'Full name is required.');
  if (password !== confirm)            return showAlert('reg-alert', 'Passwords do not match.');
  if (password.length < 8)             return showAlert('reg-alert', 'Password is too short (minimum 8 characters).');
  if (/^[0-9]+$/.test(password))       return showAlert('reg-alert', 'Password cannot be entirely numbers.');

  setLoading('btn-register', true);
  const res = await API.auth.signup({ email, password, full_name });
  setLoading('btn-register', false);

  // allauth returns 401 + { data.flows: [{ id:"verify_email", is_pending:true }] }
  // when signup succeeds but email verification is required — this is NOT an error.
  const isPendingVerification = res.data?.data?.flows?.some(
    f => f.id === 'verify_email' && f.is_pending
  );

  if (res.ok || isPendingVerification) {
    // Show the OTP verification page with the user's email as hint
    document.getElementById('verify-email-hint').textContent = email;
    Router.goAuth('verify-email');
    // Auto-focus the first OTP box
    document.querySelector('#otp-verify-email .otp-input')?.focus();
    Toast.show('Account created! Check your email for a 6-digit verification code.', 'success', 6000);
  } else {
    showAlert('reg-alert', extractError(res.data));
  }
});

/* ── LOGIN ──────────────────────────────────────────────── */
document.getElementById('form-login')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('login-alert');

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  setLoading('btn-login', true);
  const res = await API.auth.login({ email, password });
  setLoading('btn-login', false);

  const isPendingVerification = res.data?.data?.flows?.some(
    f => f.id === 'verify_email' && f.is_pending
  );

  if (res.ok) {
    Toast.show('Logged in successfully!', 'success');
    showApp();
  } else if (isPendingVerification) {
    document.getElementById('verify-email-hint').textContent = email;
    Router.goAuth('verify-email');
    document.querySelector('#otp-verify-email .otp-input')?.focus();
    Toast.show('Please verify your email first.', 'info');
  } else {
    showAlert('login-alert', extractError(res.data));
  }
});

/* ── ② VERIFY EMAIL OTP ─────────────────────────────────── */
document.getElementById('btn-verify-email')?.addEventListener('click', async () => {
  clearAlert('verify-alert');
  const code = getOtpValue('otp-verify-email');

  if (code.length < 6) {
    return showAlert('verify-alert', 'Please enter the full 6-digit code.');
  }

  setLoading('btn-verify-email', true);
  const res = await API.auth.verifyEmail(code);
  setLoading('btn-verify-email', false);

  if (res.ok) {
    Toast.show('Email verified! You are now logged in. 🎉', 'success');
    showApp();
  } else {
    clearOtp('otp-verify-email');
    showAlert('verify-alert', extractError(res.data));
  }
});

/* ── RESEND VERIFICATION ─────────────────────────────────── */
document.getElementById('btn-resend-verify')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-resend-verify');
  if (!btn) return;

  btn.disabled = true;

  // No body needed — apiFetch automatically sends X-Session-Token header
  // which allauth uses to identify the pending verification session.
  const res = await API.auth.resendVerification();

  if (res.ok) {
    Toast.show('Verification code resent! Check your inbox.', 'success');

    // Cooldown: prevent rapid resend spam — only start on success
    const originalText = btn.textContent;
    let seconds = 30;
    btn.textContent = `Resend in ${seconds}s`;
    const interval = setInterval(() => {
      seconds--;
      btn.textContent = `Resend in ${seconds}s`;
      if (seconds <= 0) {
        clearInterval(interval);
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }, 1000);
  } else {
    Toast.show(extractError(res.data), 'error');
    btn.disabled = false;  // re-enable immediately on failure
  }
});

/* ── FORGOT PASSWORD ─────────────────────────────────────── */
document.getElementById('form-forgot')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('forgot-alert');
  const email = document.getElementById('forgot-email').value.trim();

  setLoading('btn-forgot', true);
  const res = await API.auth.requestPasswordReset(email);
  setLoading('btn-forgot', false);

  if (res.ok || res.status === 200) {
    State.resetEmail = email;
    document.getElementById('reset-email-hint').textContent = email;
    Router.goAuth('reset-password');
    Toast.show('Reset code sent to your email.', 'success');
  } else {
    showAlert('forgot-alert', extractError(res.data));
  }
});

/* ── RESET PASSWORD WITH OTP ─────────────────────────────── */
document.getElementById('btn-reset-password')?.addEventListener('click', async () => {
  clearAlert('reset-alert');
  const code     = getOtpValue('otp-reset');
  const password = document.getElementById('reset-new-password').value;
  const confirm  = document.getElementById('reset-confirm-password').value;

  if (code.length < 6)  return showAlert('reset-alert', 'Please enter the 6-digit code.');
  if (!password)        return showAlert('reset-alert', 'Please enter a new password.');
  if (password !== confirm) return showAlert('reset-alert', 'Passwords do not match.');

  setLoading('btn-reset-password', true);
  const res = await API.auth.resetPasswordByCode({ email: State.resetEmail, code, password });
  setLoading('btn-reset-password', false);

  if (res.ok) {
    Router.goAuth('login');
    Toast.show('Password reset successfully! Please log in.', 'success');
  } else {
    clearOtp('otp-reset');
    showAlert('reset-alert', extractError(res.data));
  }
});

/* ── LOGOUT ─────────────────────────────────────────────── */
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await API.auth.logout();
  State.user = null;
  showAuth('login');
  Toast.show('Logged out.', 'info');
});

// ════════════════════════════════════════════════════════════
// PROFILE HANDLERS
// ════════════════════════════════════════════════════════════

document.getElementById('form-edit-profile')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('edit-profile-alert');
  const phone = document.getElementById('edit-phone').value.trim();
  const file  = document.getElementById('edit-image').files[0];

  const formData = new FormData();
  formData.append('phone', phone);
  if (file) formData.append('image', file);

  setLoading('btn-save-profile', true);
  const res = await API.updateProfile(formData);
  setLoading('btn-save-profile', false);

  if (res.ok) {
    Toast.show('Profile updated successfully!', 'success');
    await loadMe();
    Router.go('profile');
  } else {
    showAlert('edit-profile-alert', extractError(res.data));
  }
});

document.getElementById('form-change-password')?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert('change-pw-alert');
  const current = document.getElementById('current-password').value;
  const newPw   = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-new-password').value;

  if (newPw !== confirm) return showAlert('change-pw-alert', 'Passwords do not match.');
  if (newPw.length < 8)  return showAlert('change-pw-alert', 'New password must be at least 8 characters.');

  setLoading('btn-change-password', true);
  const res = await API.auth.changePassword({ current_password: current, new_password: newPw });
  setLoading('btn-change-password', false);

  if (res.ok) {
    Toast.show('Password changed successfully!', 'success');
    e.target.reset();
    showAlert('change-pw-alert', 'Password updated!', 'success');
  } else {
    showAlert('change-pw-alert', extractError(res.data));
  }
});

/* Avatar preview */
document.getElementById('edit-image')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('edit-avatar-preview').innerHTML =
      `<img src="${ev.target.result}" alt="preview">`;
  };
  reader.readAsDataURL(file);
});

// ── API Explorer ─────────────────────────────────────────────
document.querySelectorAll('.endpoint-header').forEach(header => {
  header.addEventListener('click', () => {
    const body  = header.nextElementSibling;
    const arrow = header.querySelector('.ep-arrow');
    if (body)  body.classList.toggle('open');
    if (arrow) arrow.textContent = body?.classList.contains('open') ? '▲' : '▼';
  });
});

async function explorerCall(endpointId) {
  const resultEl = document.getElementById(`result-${endpointId}`);
  if (!resultEl) return;
  resultEl.textContent = 'Loading…';
  resultEl.className   = 'response-area';
  let res;
  try {
    switch (endpointId) {
      case 'get-me':      res = await API.getMe();            break;
      case 'get-profile': res = await API.getProfile();       break;
      case 'refresh':     res = await API.auth.refreshToken(); break;
      default: return;
    }
    resultEl.textContent = JSON.stringify(res.data, null, 2);
    resultEl.className   = `response-area ${res.ok ? 'success-response' : 'error-response'}`;
  } catch (err) {
    resultEl.textContent = `Error: ${err.message}`;
    resultEl.className   = 'response-area error-response';
  }
}
window.explorerCall = explorerCall;

// ── Mobile sidebar ────────────────────────────────────────────
document.getElementById('hamburger')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
});
document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
});

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();
  setupOtpInputs('otp-verify-email');
  setupOtpInputs('otp-reset');

  document.querySelectorAll('.alert').forEach(a => a.style.display = 'none');

  // Toggle password visibility
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = btn.closest('.input-group').querySelector('input');
      if (!inp) return;
      inp.type        = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });

  // Seed the CSRF cookie so Django accepts POST requests
  try { await fetch('/_allauth/app/v1/config', { credentials: 'include' }); } catch (_) {}

  if (Tokens.isLoggedIn()) {
    showApp();
  } else {
    showAuth('login');
  }
});