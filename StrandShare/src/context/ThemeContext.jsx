import React, { createContext, useContext, useState, useEffect } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const ThemeContext = createContext();
const UI_SETTINGS_TABLE = 'UI_Settings';
const THEME_PRESETS_TABLE = 'Theme_Presets';
const BRANDING_BUCKET = 'branding_assests';
const DEFAULT_GOOGLE_FONTS = [
  'Poppins',
  'Inter',
  'Roboto',
  'Lato',
  'Montserrat',
  'Open Sans',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'Source Sans 3',
  'Work Sans',
  'Raleway',
];

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
  primaryTextColor: '#0f172a',
  secondaryTextColor: '#64748b',
  tertiaryTextColor: '#94a3b8',
  
  // Typography
  fontFamily: 'Poppins',
  selectedFont: 'Poppins',
  secondaryFontFamily: 'Poppins',
  
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

const DEFAULT_PRESET_PAYLOAD = {
  Preset_Name: 'Default',
  Primary_Color: DEFAULT_THEME.primaryColor,
  Secondary_Color: DEFAULT_THEME.secondaryColor,
  Tertiary_Color: DEFAULT_THEME.tertiaryColor,
  Primary_Text_Color: DEFAULT_THEME.primaryTextColor,
  Secondary_Text_Color: DEFAULT_THEME.secondaryTextColor,
  Tertiary_Text_Color: DEFAULT_THEME.tertiaryTextColor,
  Font_Family: DEFAULT_THEME.fontFamily,
  Secondary_Font_Family: DEFAULT_THEME.secondaryFontFamily,
  Created_At: new Date().toISOString(),
  Is_Default: true,
  Is_Deleted: false,
};

const STARTER_PRESETS = [
  {
    Preset_Name: 'Ocean Breeze',
    Primary_Color: '#0f4c81',
    Secondary_Color: '#1d7874',
    Tertiary_Color: '#7ed6df',
    Primary_Text_Color: '#0b132b',
    Secondary_Text_Color: '#1c2541',
    Tertiary_Text_Color: '#3a506b',
    Font_Family: 'Poppins',
    Secondary_Font_Family: 'Inter',
    Is_Default: false,
    Is_Deleted: false,
  },
  {
    Preset_Name: 'Sunset Coral',
    Primary_Color: '#c44536',
    Secondary_Color: '#e58e26',
    Tertiary_Color: '#f8c291',
    Primary_Text_Color: '#2f1b12',
    Secondary_Text_Color: '#5d4037',
    Tertiary_Text_Color: '#8d6e63',
    Font_Family: 'Lato',
    Secondary_Font_Family: 'Open Sans',
    Is_Default: false,
    Is_Deleted: false,
  },
  {
    Preset_Name: 'Forest Mint',
    Primary_Color: '#2d6a4f',
    Secondary_Color: '#40916c',
    Tertiary_Color: '#95d5b2',
    Primary_Text_Color: '#081c15',
    Secondary_Text_Color: '#1b4332',
    Tertiary_Text_Color: '#2d6a4f',
    Font_Family: 'Nunito',
    Secondary_Font_Family: 'Source Sans 3',
    Is_Default: false,
    Is_Deleted: false,
  },
  {
    Preset_Name: 'Slate Gold',
    Primary_Color: '#334155',
    Secondary_Color: '#475569',
    Tertiary_Color: '#f59e0b',
    Primary_Text_Color: '#0f172a',
    Secondary_Text_Color: '#334155',
    Tertiary_Text_Color: '#64748b',
    Font_Family: 'Merriweather',
    Secondary_Font_Family: 'Work Sans',
    Is_Default: false,
    Is_Deleted: false,
  },
];

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
  document.documentElement.style.setProperty('--color-text-primary', themeObj.primaryTextColor || DEFAULT_THEME.primaryTextColor);
  document.documentElement.style.setProperty('--color-text-secondary', themeObj.secondaryTextColor || DEFAULT_THEME.secondaryTextColor);
  document.documentElement.style.setProperty('--color-text-tertiary', themeObj.tertiaryTextColor || DEFAULT_THEME.tertiaryTextColor);
  document.documentElement.style.setProperty('--font-family', themeObj.selectedFont || themeObj.fontFamily || DEFAULT_THEME.fontFamily);
  document.documentElement.style.setProperty('--font-family-secondary', themeObj.secondaryFontFamily || themeObj.fontFamily || DEFAULT_THEME.secondaryFontFamily);
};

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(String(value || ''));

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

const loadGoogleFont = (fontFamily) => {
  const fontName = String(fontFamily || '').trim();
  if (!fontName || typeof document === 'undefined') {
    return;
  }

  const linkId = `google-font-${fontName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (document.getElementById(linkId)) {
    return;
  }

  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName).replace(/%20/g, '+')}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
};

const mapSettingsRowToTheme = (row) => {
  if (!row) {
    return DEFAULT_THEME;
  }

  const logoRaw = String(row.Logo_Icon || '').trim();
  const loginBgRaw = String(row.Login_Background_Photo || '').trim();
  const logoPath = logoRaw && !isAbsoluteUrl(logoRaw) ? logoRaw : '';
  const loginBgPath = loginBgRaw && !isAbsoluteUrl(loginBgRaw) ? loginBgRaw : '';

  return mergeTheme({
    primaryColor: row.Primary_Color,
    secondaryColor: row.Secondary_Color,
    tertiaryColor: row.Tertiary_Color,
    primaryTextColor: row.Primary_Text_Color,
    secondaryTextColor: row.Secondary_Text_Color,
    tertiaryTextColor: row.Tertiary_Text_Color,
    fontFamily: row.Font_Family || DEFAULT_THEME.fontFamily,
    selectedFont: row.Font_Family || DEFAULT_THEME.fontFamily,
    secondaryFontFamily: row.Secondary_Font_Family || row.Font_Family || DEFAULT_THEME.secondaryFontFamily,
    logoImage: logoRaw,
    logoImagePath: logoPath,
    loginBackgroundImage: loginBgRaw,
    loginBackgroundImagePath: loginBgPath,
  });
};

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
  const [themePresets, setThemePresets] = useState([]);
  const [googleFonts, setGoogleFonts] = useState(DEFAULT_GOOGLE_FONTS);

  const fetchGoogleFonts = async () => {
    const apiKey = process.env.REACT_APP_GOOGLE_FONTS_API_KEY;
    if (!apiKey) {
      setGoogleFonts(DEFAULT_GOOGLE_FONTS);
      return;
    }

    try {
      const response = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`);
      if (!response.ok) {
        throw new Error('Google Fonts API request failed.');
      }

      const payload = await response.json();
      const families = (payload?.items || [])
        .filter((item) => item?.kind === 'webfonts#webfont')
        .map((item) => item.family)
        .filter(Boolean)
        .slice(0, 100);

      setGoogleFonts(families.length > 0 ? families : DEFAULT_GOOGLE_FONTS);
    } catch {
      setGoogleFonts(DEFAULT_GOOGLE_FONTS);
    }
  };

  const ensureDefaultPreset = async () => {
    const { data, error } = await supabase
      .from(THEME_PRESETS_TABLE)
      .select('Preset_ID')
      .eq('Is_Default', true)
      .eq('Is_Deleted', false)
      .limit(1);

    if (error) {
      return;
    }

    if ((data || []).length === 0) {
      await supabase.from(THEME_PRESETS_TABLE).insert(DEFAULT_PRESET_PAYLOAD);
    }
  };

  const ensureStarterPresets = async () => {
    const starterNames = STARTER_PRESETS.map((preset) => preset.Preset_Name);
    if (starterNames.length === 0) {
      return;
    }

    const { data, error } = await supabase
      .from(THEME_PRESETS_TABLE)
      .select('Preset_Name')
      .in('Preset_Name', starterNames);

    if (error) {
      return;
    }

    const existingNames = new Set((data || []).map((row) => String(row.Preset_Name || '').trim()));
    const missingPresets = STARTER_PRESETS
      .filter((preset) => !existingNames.has(preset.Preset_Name))
      .map((preset) => ({
        ...preset,
        Created_At: new Date().toISOString(),
      }));

    if (missingPresets.length > 0) {
      await supabase.from(THEME_PRESETS_TABLE).insert(missingPresets);
    }
  };

  const refreshThemePresets = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setThemePresets([]);
      return [];
    }

    await ensureDefaultPreset();
    await ensureStarterPresets();

    const { data, error } = await supabase
      .from(THEME_PRESETS_TABLE)
      .select('*')
      .eq('Is_Deleted', false)
      .order('Is_Default', { ascending: false })
      .order('Created_At', { ascending: true });

    if (error) {
      return [];
    }

    const list = data || [];
    setThemePresets(list);
    return list;
  };

  const createThemePreset = async ({ presetName, colors, fontFamily, secondaryFontFamily }) => {
    const payload = {
      Preset_Name: presetName,
      Primary_Color: colors.primary,
      Secondary_Color: colors.secondary,
      Tertiary_Color: colors.tertiary,
      Primary_Text_Color: colors.fontPrimary,
      Secondary_Text_Color: colors.fontSecondary,
      Tertiary_Text_Color: colors.fontTertiary || colors.fontSecondary,
      Font_Family: fontFamily || DEFAULT_THEME.fontFamily,
      Secondary_Font_Family: secondaryFontFamily || fontFamily || DEFAULT_THEME.secondaryFontFamily,
      Created_At: new Date().toISOString(),
      Is_Default: false,
      Is_Deleted: false,
    };

    const { data, error } = await supabase
      .from(THEME_PRESETS_TABLE)
      .insert(payload)
      .select('*')
      .single();

    if (!error) {
      setThemePresets((prev) => [...prev, data].sort((a, b) => {
        if (a.Is_Default && !b.Is_Default) return -1;
        if (!a.Is_Default && b.Is_Default) return 1;
        return new Date(a.Created_At || 0).getTime() - new Date(b.Created_At || 0).getTime();
      }));
    }

    return { data, error };
  };

  const softDeleteThemePreset = async (presetId) => {
    const { error } = await supabase
      .from(THEME_PRESETS_TABLE)
      .update({ Is_Deleted: true })
      .eq('Preset_ID', presetId)
      .eq('Is_Default', false);

    if (!error) {
      setThemePresets((prev) => prev.filter((preset) => preset.Preset_ID !== presetId));
    }

    return { error };
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return undefined;
    }

    let isMounted = true;

    const loadGlobalTheme = async () => {
      const { data, error } = await supabase
        .from(UI_SETTINGS_TABLE)
        .select('*')
        .order('Updated_At', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isMounted || error || !data) {
        return;
      }

      setTheme((prev) => mergeTheme({ ...prev, ...mapSettingsRowToTheme(data) }));
    };

    loadGlobalTheme();
    refreshThemePresets();
    fetchGoogleFonts();

    const channel = supabase
      .channel('public:ui-theme-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: UI_SETTINGS_TABLE,
        },
        (payload) => {
          const nextTheme = payload?.new;
          if (!nextTheme) {
            return;
          }
          setTheme((prev) => mergeTheme({ ...prev, ...mapSettingsRowToTheme(nextTheme) }));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: THEME_PRESETS_TABLE,
        },
        () => {
          void refreshThemePresets();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [refreshThemePresets]);

  // Save theme to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('strandshare_theme', JSON.stringify(theme));
      // Update CSS variables in real-time
      applyThemeVariables(theme);
      loadGoogleFont(theme.selectedFont || theme.fontFamily);
      loadGoogleFont(theme.secondaryFontFamily || theme.fontFamily);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }, [theme]);

  const updateTheme = (newTheme) => {
    setTheme((prev) => ({ ...prev, ...newTheme }));
  };

  const saveThemeGlobally = async (newTheme, updatedByUserId = null) => {
    const mergedTheme = mergeTheme({ ...theme, ...newTheme });
    setTheme(mergedTheme);

    if (!isSupabaseConfigured || !supabase) {
      return { error: null };
    }

    const payload = {
      Primary_Color: mergedTheme.primaryColor,
      Secondary_Color: mergedTheme.secondaryColor,
      Tertiary_Color: mergedTheme.tertiaryColor,
      Primary_Text_Color: mergedTheme.primaryTextColor,
      Secondary_Text_Color: mergedTheme.secondaryTextColor,
      Tertiary_Text_Color: mergedTheme.tertiaryTextColor,
      Font_Family: mergedTheme.selectedFont || mergedTheme.fontFamily,
      Secondary_Font_Family: mergedTheme.secondaryFontFamily || mergedTheme.selectedFont || mergedTheme.fontFamily,
      Logo_Icon: mergedTheme.logoImagePath || mergedTheme.logoImage || '',
      Login_Background_Photo: mergedTheme.loginBackgroundImagePath || mergedTheme.loginBackgroundImage || '',
      Updated_By: updatedByUserId,
      Updated_At: new Date().toISOString(),
    };

    const { data: existingRow, error: existingRowError } = await supabase
      .from(UI_SETTINGS_TABLE)
      .select('Updated_At')
      .order('Updated_At', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRowError) {
      return { error: existingRowError };
    }

    if (!existingRow?.Updated_At) {
      const { error } = await supabase.from(UI_SETTINGS_TABLE).insert(payload);
      return { error };
    }

    const { error } = await supabase
      .from(UI_SETTINGS_TABLE)
      .update(payload)
      .eq('Updated_At', existingRow.Updated_At);

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
    <ThemeContext.Provider
      value={{
        theme,
        updateTheme,
        saveThemeGlobally,
        resetTheme,
        uploadImage,
        themePresets,
        refreshThemePresets,
        createThemePreset,
        softDeleteThemePreset,
        googleFonts,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
