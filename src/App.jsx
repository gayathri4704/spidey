/**
 * Spidey – App Root
 * ──────────────────────────────────────────────────────────────
 * Provider tree:
 *   AuthProvider
 *     └─ PlayerProvider
 *          └─ AppRouter
 *
 * Routing:
 *   • Not logged in       → LoginPage
 *   • Logged in as admin  → AdminDashboard + MusicPlayer
 *   • Logged in as user   → UserHome + MusicPlayer
 * ──────────────────────────────────────────────────────────────
 */

import { AuthProvider, useAuth }   from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';

import LoginPage      from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import UserHome       from './pages/UserHome';
import MusicPlayer    from './components/MusicPlayer';

// ── Protected router ──────────────────────────────────────────
function AppRouter() {
  const { isLoggedIn, isAdmin } = useAuth();
  const { currentSong }         = usePlayer();

  if (!isLoggedIn) return <LoginPage />;

  return (
    <div className={currentSong ? 'has-player' : ''}>
      {isAdmin ? <AdminDashboard /> : <UserHome />}
      <MusicPlayer isUserHome={!isAdmin} />
    </div>
  );
}

import { ThemeProvider } from './context/ThemeContext';

// ── App root ──────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PlayerProvider>
          <AppRouter />
        </PlayerProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
