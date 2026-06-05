import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [themes, setThemes] = useState([]);
  const [currentThemeId, setCurrentThemeId] = useState(null);

  // Default Spidey Theme
  const defaultTheme = {
    bg_primary: '#0a0c14',
    bg_secondary: '#0f1220',
    bg_card: '#131826',
    bg_card_hover: '#1a2235',
    bg_overlay: 'rgba(10, 12, 20, 0.85)',
    text_primary: '#f0f4ff',
    text_secondary: '#9db4cc',
    text_muted: '#5a7090',
    text_accent: '#e74c3c',
    border_primary: 'rgba(192, 57, 43, 0.3)',
    border_secondary: 'rgba(37, 99, 235, 0.25)',
    border_subtle: 'rgba(240, 244, 255, 0.08)',
    primary_color: '#c0392b',
    secondary_color: '#1a3a6b',
    accent_color: '#e74c3c'
  };

  // Load all themes
  const loadThemes = async () => {
    try {
      const { data, error } = await supabase.from('themes').select('*');
      if (!error && data) {
        setThemes(data);
      }
    } catch (err) {
      console.error('Error loading themes:', err);
    }
  };

  useEffect(() => {
    loadThemes();
  }, []);

  // Set initial theme based on user profile
  useEffect(() => {
    if (user && user.theme_id) {
      setCurrentThemeId(user.theme_id);
    } else {
      setCurrentThemeId(null);
    }
  }, [user]);

  // Apply theme to document
  useEffect(() => {
    let themeToApply = defaultTheme;
    
    if (currentThemeId) {
      const selectedTheme = themes.find(t => t.id === currentThemeId);
      if (selectedTheme) {
        themeToApply = selectedTheme;
      }
    }

    const root = document.documentElement;
    root.style.setProperty('--bg-primary', themeToApply.bg_primary);
    root.style.setProperty('--bg-secondary', themeToApply.bg_secondary);
    root.style.setProperty('--bg-card', themeToApply.bg_card);
    root.style.setProperty('--bg-card-hover', themeToApply.bg_card_hover);
    root.style.setProperty('--bg-overlay', themeToApply.bg_overlay);
    
    root.style.setProperty('--text-primary', themeToApply.text_primary);
    root.style.setProperty('--text-secondary', themeToApply.text_secondary);
    root.style.setProperty('--text-muted', themeToApply.text_muted);
    root.style.setProperty('--text-accent', themeToApply.text_accent);
    
    root.style.setProperty('--border-primary', themeToApply.border_primary);
    root.style.setProperty('--border-secondary', themeToApply.border_secondary);
    root.style.setProperty('--border-subtle', themeToApply.border_subtle);
    
    // Derived properties to keep existing CSS working
    root.style.setProperty('--spidey-red', themeToApply.primary_color);
    root.style.setProperty('--spidey-red-light', themeToApply.accent_color);
    root.style.setProperty('--spidey-red-dark', themeToApply.primary_color); // Simplified for custom themes
    
    root.style.setProperty('--spidey-blue', themeToApply.secondary_color);
    root.style.setProperty('--spidey-blue-light', themeToApply.secondary_color);
    root.style.setProperty('--spidey-blue-dark', themeToApply.secondary_color);
  }, [currentThemeId, themes]);

  const changeTheme = async (themeId) => {
    setCurrentThemeId(themeId);
    if (user) {
      await supabase.from('profiles').update({ theme_id: themeId }).eq('id', user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ themes, currentThemeId, changeTheme, loadThemes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
