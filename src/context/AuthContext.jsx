/**
 * AuthContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Provides authentication state to the entire app via Supabase Auth.
 *
 * – Session is managed by @supabase/supabase-js (JWT stored in localStorage).
 * – On auth state change, the profiles row is fetched and merged into user state.
 * – isAdmin is derived from profiles.role === 'admin'.
 * – No IndexedDB involvement here.
 * ─────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// ── Context ───────────────────────────────────
const AuthContext = createContext(null);

// ── Internal helpers ──────────────────────────

/**
 * Fetches the profiles row for a given Supabase auth user ID.
 * Returns null on error (e.g. profile not created yet).
 *
 * @param {string} userId – Supabase auth UUID
 * @returns {Promise<object|null>}
 */
async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle(); // returns null (not error) when row doesn't exist yet

  if (error) {
    console.warn('[AuthContext] fetchProfile:', error.message);
    return null;
  }
  return data;
}

/**
 * Ensures the profile exists, creating it if necessary.
 */
async function ensureProfile(authUser, usernameFallback) {
  if (!authUser?.id) return null;

  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (fetchError) {
    console.warn('[AuthContext] profile fetch failed:', fetchError.message);
  }

  if (existing) return existing;

  const fallbackName =
    usernameFallback ||
    authUser.user_metadata?.username ||
    authUser.email?.split('@')[0] ||
    'user';

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: authUser.id,
        email: authUser.email,
        username: fallbackName,
        display_name: fallbackName,
        role: 'user',
        access_status: 'pending'
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (createError) {
    console.error('[AuthContext] profile create failed:', createError.message);
    return null;
  }

  return created;
}

/**
 * Merges a Supabase auth user with its profiles row into a single object.
 */
function buildUserObject(authUser, profile) {
  return {
    id:           authUser.id,
    email:        authUser.email,
    createdAt:    authUser.created_at,
    // profile fields (may be null during registration race)
    username:     profile?.username     ?? authUser.email,
    display_name: profile?.display_name ?? authUser.email,
    role:         profile?.role         ?? 'user',
    access_status:profile?.access_status?? 'pending',
    theme:        profile?.theme        ?? 'default',
  };
}

// ── Provider ──────────────────────────────────

/**
 * AuthProvider
 * ────────────
 * Wrap the app root with this provider to make auth state available
 * everywhere via useAuth().
 */
export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // ── Bootstrap: restore session on mount ──────
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && mounted) {
        const profile = await ensureProfile(session.user);
        setUser(buildUserObject(session.user, profile));
      }
      if (mounted) setIsInitializing(false);
    });

    // ── Subscribe to future auth changes ──────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (session?.user) {
          const profile = await ensureProfile(session.user);
          setUser(buildUserObject(session.user, profile));
        } else {
          setUser(null);
        }
        setIsInitializing(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Derived flags ─────────────────────────────
  const isLoggedIn = user !== null;
  const isAdmin    = user?.role === 'admin';

  // ── login ─────────────────────────────────────
  /**
   * Signs in with email + password via Supabase Auth.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const friendly = {
        'Invalid login credentials': 'Incorrect email or password. Please try again.',
        'Email not confirmed':       'Please confirm your email before signing in.',
      };
      return {
        success: false,
        error: friendly[error.message] ?? error.message,
      };
    }
    // onAuthStateChange fires → setUser handled automatically
    return { success: true };
  }, []);

  // ── register ──────────────────────────────────
  /**
   * Signs up a new user with Supabase Auth, then inserts a profiles row.
   *
   * @param {string} username
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ success: boolean, needsEmailConfirmation?: boolean, error?: string }>}
   */
  const register = useCallback(async (username, email, password) => {
    // 1. Create auth account
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const friendly = {
        'User already registered': 'An account with that email already exists.',
      };
      return {
        success: false,
        error: friendly[error.message] ?? error.message,
      };
    }

    const authUser = data?.user;
    if (!authUser) {
      return { success: false, error: 'Sign up failed. Please try again.' };
    }

    // 2. Insert or upsert profiles row
    const profile = await ensureProfile(authUser, username.trim());
    if (!profile) {
      console.warn('[AuthContext] Profile creation returned null');
      // Non-fatal – user can still log in; profile can be created later
    }

    // If Supabase email confirmation is enabled, session will be null
    if (!data.session) {
      return { success: true, needsEmailConfirmation: true };
    }

    // onAuthStateChange fires → setUser handled automatically
    return { success: true };
  }, []);

  // ── logout ────────────────────────────────────
  /**
   * Signs out and clears all local state.
   */
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  // ── Refresh profile ───────────────────────────
  /**
   * Re-fetches the profiles row and updates local state.
   * Useful after admin manually updates roles.
   */
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const profile = await ensureProfile(user);
    if (profile) {
      setUser((prev) => ({ ...prev, ...profile }));
    }
  }, [user?.id]);

  const value = {
    user,
    isLoggedIn,
    isAdmin,
    login,
    register,
    logout,
    refreshProfile,
  };

  if (isInitializing) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', flexDirection: 'column', gap: '16px',
        background: 'var(--bg-primary)', color: 'var(--text-primary)',
      }}>
        <span className="login-spinner" style={{ width: '40px', height: '40px' }} aria-hidden="true" />
        <p style={{ fontFamily: 'var(--font-heading)' }}>Loading Spidey…</p>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────

/**
 * useAuth
 * ───────
 * Custom hook – must be called inside <AuthProvider>.
 *
 * @returns {{ user, isLoggedIn, isAdmin, login, register, logout, refreshProfile }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
