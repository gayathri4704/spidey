/**
 * LoginPage.jsx
 * ─────────────────────────────────────────────────────
 * Spidey – Login / Register page
 *
 * Layout  : Two-column (decorative panel + form area)
 * Tabs    : 🛡️ Admin Login  |  🕷️ User Login
 * Modes   : login | register  (toggled via link, user tab only)
 *
 * Auth delegates to AuthContext → Supabase Auth.
 * Both Admin and User sign in with email + password.
 * Admin access is determined by profiles.role = 'admin'.
 * ─────────────────────────────────────────────────────
 */

import { useState, useId } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/login.css';

// ── Tab definitions ──────────────────────────
const TABS = [
  { id: 'admin', label: 'Admin', icon: '🛡️' },
  { id: 'user',  label: 'User',  icon: '🕷️' },
];

// ── Single controlled input ──────────────────
function FormInput({ id, label, type = 'text', icon, placeholder, value, onChange, error, autoComplete }) {
  const [showPw, setShowPw] = useState(false);
  const isPassword = type === 'password';
  const inputType  = isPassword && showPw ? 'text' : type;

  return (
    <div className="form-group">
      <label htmlFor={id} className="form-label">{label}</label>
      <div className="form-input-wrap">
        <span className="form-input-icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          type={inputType}
          className={`form-input${error ? ' input-error' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          spellCheck={false}
          style={{ paddingRight: isPassword ? '40px' : '14px' }}
        />
        {isPassword && (
          <button
            type="button"
            className="pw-toggle"
            onClick={() => setShowPw((p) => !p)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPw ? '🙈' : '👁️'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Alert banner ─────────────────────────────
function Alert({ type, message }) {
  if (!message) return null;
  return (
    <div className={`login-alert login-alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{type === 'error' ? '⚠️' : '✅'}</span>
      {message}
    </div>
  );
}

// ── Admin Login Form ─────────────────────────
function AdminLoginForm() {
  const { login } = useAuth();
  const uid = useId();

  const [fields, setFields]   = useState({ email: '', password: '' });
  const [error,  setError]    = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setFields((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(fields.email.trim(), fields.password);

    setLoading(false);
    if (!result.success) setError(result.error);
    // On success AuthContext fires → App.jsx re-renders → redirects automatically
  };

  return (
    <form id="admin-login-form" className="login-form" onSubmit={handleSubmit} noValidate>
      <FormInput
        id={`${uid}-admin-email`}
        label="Admin Email"
        type="email"
        icon="📧"
        placeholder="admin@example.com"
        value={fields.email}
        onChange={set('email')}
        autoComplete="email"
      />
      <FormInput
        id={`${uid}-admin-pass`}
        label="Password"
        type="password"
        icon="🔐"
        placeholder="Enter admin password"
        value={fields.password}
        onChange={set('password')}
        autoComplete="current-password"
      />

      <Alert type="error" message={error} />

      <button
        id="admin-login-btn"
        type="submit"
        className="btn btn-primary login-submit"
        disabled={loading}
      >
        {loading && <span className="login-spinner" aria-hidden="true" />}
        {loading ? 'Authenticating…' : '🛡️  Login as Admin'}
      </button>

      <div className="admin-hint">
        <strong>Admin access:</strong><br />
        Sign in with your email, then ensure <code>profiles.role = &apos;admin&apos;</code> is set
        in the Supabase dashboard.
      </div>
    </form>
  );
}

// ── User Login Form ───────────────────────────
function UserLoginForm({ onSwitchToRegister }) {
  const { login } = useAuth();
  const uid = useId();

  const [fields, setFields]   = useState({ email: '', password: '' });
  const [error,  setError]    = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setFields((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(fields.email.trim(), fields.password);

    setLoading(false);
    if (!result.success) setError(result.error);
  };

  return (
    <>
      <form id="user-login-form" className="login-form" onSubmit={handleSubmit} noValidate>
        <FormInput
          id={`${uid}-user-email`}
          label="Email"
          type="email"
          icon="📧"
          placeholder="you@example.com"
          value={fields.email}
          onChange={set('email')}
          autoComplete="email"
        />
        <FormInput
          id={`${uid}-user-pass`}
          label="Password"
          type="password"
          icon="🔐"
          placeholder="Your password"
          value={fields.password}
          onChange={set('password')}
          autoComplete="current-password"
        />

        <Alert type="error" message={error} />

        <button
          id="user-login-btn"
          type="submit"
          className="btn btn-primary login-submit"
          disabled={loading}
        >
          {loading && <span className="login-spinner" aria-hidden="true" />}
          {loading ? 'Signing in…' : '🕷️  Sign In'}
        </button>
      </form>

      <div className="login-footer-links">
        <span>
          Don&apos;t have an account?{' '}
          <button id="go-register-btn" onClick={onSwitchToRegister}>
            Register here
          </button>
        </span>
      </div>
    </>
  );
}

// ── Register Form ─────────────────────────────
function RegisterForm({ onSwitchToLogin }) {
  const { register } = useAuth();
  const uid = useId();

  const [fields, setFields]   = useState({ username: '', email: '', password: '', confirm: '' });
  const [error,  setError]    = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setFields((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fields.username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!fields.email.trim()) {
      setError('Email address is required.');
      return;
    }
    if (fields.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (fields.password !== fields.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const result = await register(fields.username.trim(), fields.email.trim(), fields.password);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.needsEmailConfirmation) {
      setSuccess('Account created! 📧 Check your email and click the confirmation link before signing in.');
      return;
    }

    // On success with session → AuthContext state updates → App.jsx redirects automatically
  };

  return (
    <>
      <form id="register-form" className="login-form" onSubmit={handleSubmit} noValidate>
        <FormInput
          id={`${uid}-reg-user`}
          label="Username"
          icon="🕷️"
          placeholder="Pick a unique username"
          value={fields.username}
          onChange={set('username')}
          autoComplete="username"
        />
        <FormInput
          id={`${uid}-reg-email`}
          label="Email"
          type="email"
          icon="📧"
          placeholder="you@example.com"
          value={fields.email}
          onChange={set('email')}
          autoComplete="email"
        />
        <FormInput
          id={`${uid}-reg-pass`}
          label="Password"
          type="password"
          icon="🔐"
          placeholder="At least 6 characters"
          value={fields.password}
          onChange={set('password')}
          autoComplete="new-password"
        />
        <FormInput
          id={`${uid}-reg-confirm`}
          label="Confirm Password"
          type="password"
          icon="🔒"
          placeholder="Repeat your password"
          value={fields.confirm}
          onChange={set('confirm')}
          autoComplete="new-password"
        />

        <Alert type="error"   message={error}   />
        <Alert type="success" message={success}  />

        <button
          id="register-submit-btn"
          type="submit"
          className="btn btn-primary login-submit"
          disabled={loading}
        >
          {loading && <span className="login-spinner" aria-hidden="true" />}
          {loading ? 'Creating account…' : '✨  Create Account'}
        </button>
      </form>

      <div className="login-footer-links">
        <span>
          Already have an account?{' '}
          <button id="go-login-btn" onClick={onSwitchToLogin}>
            Sign in here
          </button>
        </span>
      </div>
    </>
  );
}

// ── LoginPage (root) ──────────────────────────
export default function LoginPage() {
  const [activeTab, setActiveTab] = useState('admin'); // 'admin' | 'user'
  const [mode,      setMode]      = useState('login'); // 'login' | 'register'

  const handleTab = (tabId) => {
    setActiveTab(tabId);
    setMode('login');
  };

  return (
    <div className="login-screen" aria-label="Spidey login screen">

      {/* ── Left decorative panel ── */}
      <div className="login-panel" aria-hidden="true">
        <img src="/icons/icon-192.png" alt="Spidey Logo" className="login-panel__spider" />
        <div className="login-panel__logo">SPIDEY</div>
        <p className="login-panel__tagline">Your Friendly Neighbourhood App</p>
        <div className="login-panel__quote">
          <blockquote>
            &quot;With great power comes great responsibility.&quot;
          </blockquote>
          <cite>— Ben Parker</cite>
        </div>
      </div>

      {/* ── Right form area ── */}
      <div className="login-form-area">

        {/* Mobile logo */}
        <div className="login-mobile-logo">
          <img src="/icons/icon-192.png" alt="Spidey Logo" className="login-mobile-logo__icon" />
          <div className="login-mobile-logo__text">SPIDEY</div>
        </div>

        {/* Tab switcher */}
        <div className="login-tabs" role="tablist" aria-label="Login type">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`panel-${id}`}
              className={`login-tab${activeTab === id ? ' active' : ''}`}
              onClick={() => handleTab(id)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* ── Admin panel ── */}
        {activeTab === 'admin' && (
          <div
            id="panel-admin"
            role="tabpanel"
            aria-labelledby="tab-admin"
            className="login-card"
          >
            <h1 className="login-card__title">
              Admin <span className="text-gradient-red">Login</span>
            </h1>
            <p className="login-card__subtitle">
              Restricted access. Sign in with your admin email and password.
            </p>
            <AdminLoginForm />
          </div>
        )}

        {/* ── User panel ── */}
        {activeTab === 'user' && (
          <div
            id="panel-user"
            role="tabpanel"
            aria-labelledby="tab-user"
            className="login-card"
          >
            {mode === 'login' ? (
              <>
                <h1 className="login-card__title">
                  Welcome <span className="text-gradient-red">Back</span>
                </h1>
                <p className="login-card__subtitle">
                  Sign in to access your Spidey portal and manage your content.
                </p>
                <UserLoginForm onSwitchToRegister={() => setMode('register')} />
              </>
            ) : (
              <>
                <h1 className="login-card__title">
                  Join the <span className="text-gradient-red">Web</span>
                </h1>
                <p className="login-card__subtitle">
                  Create your Spidey account. Your data is securely stored in the cloud.
                </p>
                <RegisterForm onSwitchToLogin={() => setMode('login')} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
