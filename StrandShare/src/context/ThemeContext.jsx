import React, { createContext, useContext, useState, useEffect } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const ThemeContext = createContext();
const GLOBAL_THEME_TABLE = 'app_theme_settings';
const GLOBAL_THEME_ROW_ID = 1;
const BRANDING_BUCKET = 'branding_assets';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const DEFAULT_THEME = {
  // Primary Color
  primaryColor: '#0275d8',
  primaryColorDark: '#025aa3',
  primaryColorLight: '#0a8ef5',
  
  // Secondary Color
  secondaryColor: '#6B7280',
  secondaryColorDark: '#4B5563',
  secondaryColorLight: '#9CA3AF',
  
  // Tertiary Color
  tertiaryColor: '#10b981',
  tertiaryColorDark: '#059669',
  tertiaryColorLight: '#34d399',
  
  // Typography
  fontFamily: 'sans-serif',
  fontOptions: ['sans-serif', 'serif', 'monospace'],
  googleFonts: ['Roboto', 'Inter', 'Poppins', 'Playfair Display', 'Lato'],
  selectedFont: 'sans-serif',
  
  // Branding
  brandName: 'StrandShare',
  brandTagline: 'IT & System Ops',
  logoImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1080&q=80',
  logoImagePath: '',
  faviconImage: '',
  loginBackgroundImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1080&q=80',
  loginBackgroundImagePath: '',
  logoImageFile: null,
  faviconImageFile: null,
  loginBgImageFile: null,
  
  // Layout Settings
  sidebarPosition: 'left', // 'left', 'right'
  sidebarCollapsed: false,
  navbarPosition: 'top', // 'top', 'bottom'
};

// Helper function to apply CSS variables globally
const applyThemeVariables = (themeObj) => {
  document.documentElement.style.setProperty('--color-primary', themeObj.primaryColor);
  document.documentElement.style.setProperty('--color-primary-dark', themeObj.primaryColorDark);
  document.documentElement.style.setProperty('--color-primary-light', themeObj.primaryColorLight);
  document.documentElement.style.setProperty('--color-secondary', themeObj.secondaryColor);
  document.documentElement.style.setProperty('--color-secondary-dark', themeObj.secondaryColorDark);
  document.documentElement.style.setProperty('--color-secondary-light', themeObj.secondaryColorLight);
  document.documentElement.style.setProperty('--color-tertiary', themeObj.tertiaryColor);
  document.documentElement.style.setProperty('--color-tertiary-dark', themeObj.tertiaryColorDark);
  document.documentElement.style.setProperty('--color-tertiary-light', themeObj.tertiaryColorLight);
  document.documentElement.style.setProperty('--font-family', themeObj.selectedFont || 'sans-serif');
};

const isBlobUrl = (value) => String(value || '').startsWith('blob:');

const resolveBrandingAssetUrl = (urlValue, pathValue, fallbackValue) => {
  if (pathValue && supabase) {
    const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(pathValue);
    if (data?.publicUrl) {
      return data.publicUrl;
    }
  }

  if (urlValue && !isBlobUrl(urlValue)) {
    return urlValue;
  }

  return fallbackValue;
};

const sanitizeThemeMedia = (rawTheme) => {
  const nextTheme = { ...(rawTheme || {}) };
  nextTheme.logoImage = resolveBrandingAssetUrl(
    nextTheme.logoImage,
    nextTheme.logoImagePath,
    DEFAULT_THEME.logoImage,
  );
  nextTheme.loginBackgroundImage = resolveBrandingAssetUrl(
    nextTheme.loginBackgroundImage,
    nextTheme.loginBackgroundImagePath,
    DEFAULT_THEME.loginBackgroundImage,
  );
  return nextTheme;
};

const mergeTheme = (rawTheme) => ({ ...DEFAULT_THEME, ...sanitizeThemeMedia(rawTheme) });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('strandshare_theme');
      const parsedTheme = saved ? JSON.parse(saved) : {};
      const mergedTheme = mergeTheme(parsedTheme);
      
      // Apply CSS variables immediately on load
      applyThemeVariables(mergedTheme);
      
      return mergedTheme;
    } catch {
      applyThemeVariables(DEFAULT_THEME);
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }

    let isMounted = true;

    const loadGlobalTheme = async () => {
      const { data, error } = await supabase
        .from(GLOBAL_THEME_TABLE)
        .select('theme_json')
        .eq('id', GLOBAL_THEME_ROW_ID)
        .maybeSingle();

      if (!isMounted || error || !data?.theme_json) {
        return;
      }

      setTheme((prev) => mergeTheme({ ...prev, ...data.theme_json }));
    };

    loadGlobalTheme();

    const channel = supabase
      .channel('public:app-theme-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: GLOBAL_THEME_TABLE,
          filter: `id=eq.${GLOBAL_THEME_ROW_ID}`,
        },
        (payload) => {
          const nextTheme = payload?.new?.theme_json;
          if (!nextTheme) {
            return;
          }
          setTheme((prev) => mergeTheme({ ...prev, ...nextTheme }));
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Save theme to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('strandshare_theme', JSON.stringify(theme));
      // Update CSS variables in real-time
      applyThemeVariables(theme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }, [theme]);

  const updateTheme = (newTheme) => {
    setTheme((prev) => ({ ...prev, ...newTheme }));
  };

  const saveThemeGlobally = async (newTheme) => {
    const mergedTheme = mergeTheme({ ...theme, ...newTheme });
    setTheme(mergedTheme);

    if (!isSupabaseConfigured || !supabase) {
      return { error: null };
    }

    const { error } = await supabase
      .from(GLOBAL_THEME_TABLE)
      .upsert(
        {
          id: GLOBAL_THEME_ROW_ID,
          theme_json: mergedTheme,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    return { error };
  };

  const resetTheme = () => {
    setTheme(DEFAULT_THEME);
    localStorage.removeItem('strandshare_theme');
  };

  const uploadImage = (imageType, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target.result;
      const key = `${imageType}ImageFile`;
      const urlKey = `${imageType}Image`;
      setTheme((prev) => ({
        ...prev,
        [key]: file,
        [urlKey]: imageData,
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <ThemeContext.Provider value={{ theme, updateTheme, saveThemeGlobally, resetTheme, uploadImage }}>
      {children}
    </ThemeContext.Provider>
  );
}
