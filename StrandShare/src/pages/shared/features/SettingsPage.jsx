import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { Check, Eye, EyeOff, Save, Upload, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { logAuditAction } from '../../../lib/auditLogger';

const TAB_ITEMS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'system', label: 'System Preferences' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'branding', label: 'Branding' },
];

const BRANDING_EDITOR_TABS = [
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'branding', label: 'Branding' },
];

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAfLvIqVf_2t5cQGBgl2JtMqAfNL4VFIxY--QIC_GbWZaM-6I35ji6GFNyuaVczmP-4JWeN9_Cu174m5U6OCEk8UDHJDD6W-r9j5qv-xxfQvZM46On__Scm_j3z-RdVOyTNguzeQ-_xs0yt9AbfB_fN3G3c2GEbfaTBfaV4JMD2WULL90Qr8fBAk4ORtWQkq6QwL2ZH0qjS8id-dyirChie2_KkZDIH4dg4eKXCE91esg_QAmzhyBOFPP8S2koA5Wmr1oSHati1OKo';

const USER_PROFILE_STORAGE_KEY = 'strandshare_user_profile';
const USER_PROFILE_READY_EVENT = 'strandshare-profile-ready';
const SETTINGS_PROFILE_CACHE_KEY = 'strandshare_settings_profile_cache';
const SYSTEM_PREFS_CACHE_KEY = 'strandshare_system_prefs_cache';
const NOTIFICATION_PREFS_CACHE_KEY = 'strandshare_notification_prefs_cache';
const BRANDING_BUCKET = 'branding_assets';

function normalizeGenderOption(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  if (['male', 'female', 'non-binary', 'prefer-not-to-say'].includes(normalized)) {
    return normalized;
  }

  return 'male';
}

function mapGenderForStorage(value) {
  const option = normalizeGenderOption(value);
  if (option === 'prefer-not-to-say') return 'Prefer not to say';
  if (option === 'non-binary') return 'Non-binary';
  if (option === 'female') return 'Female';
  return 'Male';
}

function formatRoleLabel(value) {
  return String(value || 'User')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSuperAdminRole(value) {
  return lowerCaseRoleKey(value) === 'superadmin';
}

function lowerCaseRoleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isBlobUrl(value) {
  return String(value || '').startsWith('blob:');
}

function getStoragePublicUrl(bucket, path) {
  if (!path || !supabase) {
    return '';
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}

function resolveAvatarUrl(photoPath) {
  if (!photoPath) {
    return DEFAULT_AVATAR;
  }

  if (isAbsoluteUrl(photoPath)) {
    return photoPath;
  }

  if (!supabase) {
    return DEFAULT_AVATAR;
  }

  const { data } = supabase.storage.from('profile_pictures').getPublicUrl(photoPath);
  return data?.publicUrl || DEFAULT_AVATAR;
}

function formatActivityTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || '-');
  }

  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString()}`;
}

function currentDeviceLabel() {
  const ua = navigator.userAgent || '';

  if (/edg/i.test(ua)) return 'Edge on Windows';
  if (/chrome/i.test(ua) && /windows/i.test(ua)) return 'Chrome on Windows';
  if (/safari/i.test(ua) && /iphone/i.test(ua)) return 'Safari on iPhone';
  if (/safari/i.test(ua) && /mac/i.test(ua)) return 'Safari on macOS';
  if (/firefox/i.test(ua)) return 'Firefox';

  return 'Current device';
}

function actionLabel(actionValue = '') {
  const normalized = String(actionValue || '').replace(/[._]+/g, ' ').trim();
  return normalized ? normalized.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Activity';
}

function extractDeviceFromDescription(description = '') {
  const match = String(description).match(/from\s([^[]+)/i);
  if (!match?.[1]) {
    return 'Recent device';
  }

  return match[1].trim();
}

function mapStorageUploadError(rawMessage) {
  const message = String(rawMessage || 'Upload failed.');
  if (message.toLowerCase().includes('row-level security')) {
    return 'Upload blocked by Storage RLS policy. Apply the profile_pictures bucket policies and make sure you are logged in.';
  }
  return message;
}

const BRAND_PRESETS = [
  {
    id: 'default-theme',
    name: 'Default Theme',
    badge: 'Active',
    colors: {
      primary: '#0078bd',
      primaryDark: '#025aa3',
      primaryLight: '#0a8ef5',
      secondary: '#667280',
      secondaryDark: '#485563',
      secondaryLight: '#9ca3af',
      tertiary: '#d1d9e2',
      tertiaryDark: '#c4ced9',
      tertiaryLight: '#e8edf3',
      fontPrimary: '#0f172a',
      fontSecondary: '#64748b',
    },
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    colors: {
      primary: '#163a5f',
      primaryDark: '#1f4f83',
      primaryLight: '#4f8fdb',
      secondary: '#337ab7',
      secondaryDark: '#2f5f8f',
      secondaryLight: '#60a5fa',
      tertiary: '#c5d4eb',
      tertiaryDark: '#b8c9e3',
      tertiaryLight: '#dbeafe',
      fontPrimary: '#0f172a',
      fontSecondary: '#475569',
    },
  },
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    colors: {
      primary: '#7c2d12',
      primaryDark: '#9a3412',
      primaryLight: '#f97316',
      secondary: '#c2410c',
      secondaryDark: '#9a3412',
      secondaryLight: '#fb923c',
      tertiary: '#f2e1ca',
      tertiaryDark: '#edd8bd',
      tertiaryLight: '#ffedd5',
      fontPrimary: '#1f2937',
      fontSecondary: '#6b7280',
    },
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    colors: {
      primary: '#166534',
      primaryDark: '#14532d',
      primaryLight: '#22c55e',
      secondary: '#15803d',
      secondaryDark: '#166534',
      secondaryLight: '#4ade80',
      tertiary: '#bbf7d0',
      tertiaryDark: '#a7f3c0',
      tertiaryLight: '#dcfce7',
      fontPrimary: '#052e16',
      fontSecondary: '#3f3f46',
    },
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    colors: {
      primary: '#6d28d9',
      primaryDark: '#5b21b6',
      primaryLight: '#8b5cf6',
      secondary: '#7c3aed',
      secondaryDark: '#6d28d9',
      secondaryLight: '#a78bfa',
      tertiary: '#ddd6fe',
      tertiaryDark: '#c4b5fd',
      tertiaryLight: '#ede9fe',
      fontPrimary: '#2e1065',
      fontSecondary: '#64748b',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: {
      primary: '#6366f1',
      primaryDark: '#4f46e5',
      primaryLight: '#818cf8',
      secondary: '#334155',
      secondaryDark: '#1e293b',
      secondaryLight: '#64748b',
      tertiary: '#22d3ee',
      tertiaryDark: '#0891b2',
      tertiaryLight: '#67e8f9',
      fontPrimary: '#e2e8f0',
      fontSecondary: '#94a3b8',
    },
  },
];

function Toggle({ checked, onChange, activeColor }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300"
      style={{ backgroundColor: checked ? activeColor : '#cbd5e1' }}
      aria-pressed={checked}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { theme, updateTheme, saveThemeGlobally } = useTheme();

  const readCachedProfile = () => {
    let settingsParsed = null;
    let userParsed = null;

    try {
      const settingsRaw = localStorage.getItem(SETTINGS_PROFILE_CACHE_KEY);
      settingsParsed = settingsRaw ? JSON.parse(settingsRaw) : null;
    } catch {
      // ignore cache parse errors
    }

    try {
      const userRaw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
      userParsed = userRaw ? JSON.parse(userRaw) : null;
    } catch {
      userParsed = null;
    }

    if (!settingsParsed && !userParsed) {
      return null;
    }

    // Merge both caches so profile photo path from shell cache is not lost.
    return {
      ...(userParsed || {}),
      ...(settingsParsed || {}),
      photo_path: settingsParsed?.photo_path || userParsed?.photo_path || '',
    };
  };

  const [activeTab, setActiveTab] = useState('profile');
  const [previewView, setPreviewView] = useState('login');
  const [brandingEditorTab, setBrandingEditorTab] = useState('colors');
  const [selectedThemeId, setSelectedThemeId] = useState('default-theme');
  const [toast, setToast] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authUserId, setAuthUserId] = useState('');
  const [userId, setUserId] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isVerifyingPasswordOtp, setIsVerifyingPasswordOtp] = useState(false);
  const [passwordMfaRequired, setPasswordMfaRequired] = useState(false);
  const [passwordMfaCode, setPasswordMfaCode] = useState('');
  const [passwordMfaFactorId, setPasswordMfaFactorId] = useState('');
  const [isVerifyingPasswordMfa, setIsVerifyingPasswordMfa] = useState(false);
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);
  const [isProfileHydrated, setIsProfileHydrated] = useState(false);
  const [mfaSetup, setMfaSetup] = useState({
    enrolling: false,
    factorId: '',
    qrSvg: '',
    secret: '',
    code: '',
  });
  const [isVerifyingMfaCode, setIsVerifyingMfaCode] = useState(false);

  const [profile, setProfile] = useState(() => {
    const storedProfile = readCachedProfile();
    const storedPhotoPath = storedProfile?.photo_path || '';
    const cachedAvatar = isAbsoluteUrl(storedProfile?.avatar) ? storedProfile.avatar : '';
    const resolvedAvatar = storedPhotoPath ? resolveAvatarUrl(storedPhotoPath) : cachedAvatar;

    return {
      firstName: storedProfile?.first_name || storedProfile?.firstName || '',
      middleName: storedProfile?.middle_name || storedProfile?.middleName || '',
      lastName: storedProfile?.last_name || storedProfile?.lastName || '',
      suffix: storedProfile?.suffix || '',
      gender: normalizeGenderOption(storedProfile?.gender || 'male'),
      email: storedProfile?.email || '',
      role: storedProfile?.role || '',
      avatar: resolvedAvatar || '',
    };
  });
  const [avatarStoragePath, setAvatarStoragePath] = useState(() => {
    const storedProfile = readCachedProfile();
    const storedPhotoPath = storedProfile?.photo_path || '';
    return storedPhotoPath && !isAbsoluteUrl(storedPhotoPath) ? storedPhotoPath : '';
  });

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    passwordOtp: '',
    twoFactorEnabled: true,
    activeSessions: [],
    loginSessions: [],
  });

  const loadSecurityActivity = useCallback(async (targetUserId) => {
    if (!isSupabaseConfigured || !supabase || !targetUserId) {
      return;
    }

    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('time, action, description, resource, status')
      .eq('user_id', targetUserId)
      .order('time', { ascending: false })
      .limit(80);

    if (error) {
      return;
    }

    const loginRows = (logs || []).map((row) => ({
      time: formatActivityTime(row.time),
      action: actionLabel(row.action),
      ip: row.resource || row.status || 'N/A',
    }));

    const signInLogs = (logs || []).filter((row) => row.action === 'auth.sign_in').slice(0, 6);
    const historicalSessions = signInLogs.map((row, index) => ({
      device: extractDeviceFromDescription(row.description),
      location: 'Recorded from activity logs',
      lastActive: index === 0 ? 'Latest sign-in' : formatActivityTime(row.time),
      current: false,
    }));

    const sessions = [
      {
        device: currentDeviceLabel(),
        location: 'Current browser session',
        lastActive: 'Now',
        current: true,
      },
      ...historicalSessions,
    ];

    const uniqueSessions = sessions.filter((session, index, arr) => {
      const key = `${session.device}-${session.lastActive}`;
      return arr.findIndex((entry) => `${entry.device}-${entry.lastActive}` === key) === index;
    });

    setSecurity((prev) => ({
      ...prev,
      activeSessions: uniqueSessions,
      loginSessions: loginRows,
    }));
  }, []);

  const passwordRuleChecks = useMemo(() => {
    const value = security.newPassword || '';
    return {
      minLength: value.length >= 8,
      uppercase: /[A-Z]/.test(value),
      lowercase: /[a-z]/.test(value),
      number: /\d/.test(value),
      special: /[^A-Za-z0-9]/.test(value),
    };
  }, [security.newPassword]);

  const isPasswordChecklistComplete =
    passwordRuleChecks.minLength &&
    passwordRuleChecks.uppercase &&
    passwordRuleChecks.lowercase &&
    passwordRuleChecks.number &&
    passwordRuleChecks.special;

  const [systemPreferences, setSystemPreferences] = useState(() => {
    try {
      const raw = localStorage.getItem(SYSTEM_PREFS_CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore cache parse errors
    }

    return {
      language: 'en',
      timezone: 'Asia/Manila',
      maintenanceMode: false,
    };
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const raw = localStorage.getItem(NOTIFICATION_PREFS_CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore cache parse errors
    }

    return {
      email: true,
      push: false,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch {
      // ignore cache write errors
    }
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem(SYSTEM_PREFS_CACHE_KEY, JSON.stringify(systemPreferences));
    } catch {
      // ignore cache write errors
    }
  }, [systemPreferences]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_PREFS_CACHE_KEY, JSON.stringify(notifications));
    } catch {
      // ignore cache write errors
    }
  }, [notifications]);

  const [tempColors, setTempColors] = useState({
    primary: theme.primaryColor,
    primaryDark: theme.primaryColorDark,
    primaryLight: theme.primaryColorLight,
    secondary: theme.secondaryColor,
    secondaryDark: theme.secondaryColorDark,
    secondaryLight: theme.secondaryColorLight,
    tertiary: theme.tertiaryColor,
    tertiaryDark: theme.tertiaryColorDark,
    tertiaryLight: theme.tertiaryColorLight,
    fontPrimary: '#0f172a',
    fontSecondary: '#64748b',
  });

  const [brandingMeta, setBrandingMeta] = useState({
    brandName: theme.brandName || 'StrandShare',
    brandTagline: theme.brandTagline || 'Every Strand Counts',
    loginTitle: 'Welcome Back',
    loginSubtitle: 'Login to continue supporting our beautyAI community.',
    primaryFontFamily: 'Poppins, sans-serif',
    secondaryFontFamily: 'Inter, sans-serif',
    cornerStyle: 'rounded',
  });

  const [brandingAssets, setBrandingAssets] = useState({
    logoImage: theme.logoImage || '',
    loginBackgroundImage: theme.loginBackgroundImage || '',
  });
  const [brandingAssetPaths, setBrandingAssetPaths] = useState({
    logoImagePath: theme.logoImagePath || '',
    loginBackgroundImagePath: theme.loginBackgroundImagePath || '',
  });
  const [brandingUploadStatus, setBrandingUploadStatus] = useState({
    logoImage: false,
    loginBackgroundImage: false,
  });

  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(130deg, ${tempColors.primaryLight}20, ${tempColors.primary}12, ${tempColors.secondary}14)`,
    }),
    [tempColors],
  );

  const canManageBranding = useMemo(() => isSuperAdminRole(profile.role), [profile.role]);
  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((tab) => tab.id !== 'branding' || canManageBranding),
    [canManageBranding],
  );

  useEffect(() => {
    if (activeTab === 'branding' && !canManageBranding) {
      setActiveTab('profile');
    }
  }, [activeTab, canManageBranding]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    loadSecurityActivity(userId);
  }, [userId, loadSecurityActivity]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const pushUserProfileToShell = (nextProfile) => {
    try {
      const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = {
        ...parsed,
        ...nextProfile,
        auth_user_id: authUserId || parsed?.auth_user_id,
      };

      localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(merged));
      if (merged?.auth_user_id) {
        window.dispatchEvent(
          new CustomEvent(USER_PROFILE_READY_EVENT, {
            detail: {
              authUserId: merged.auth_user_id,
              profile: merged,
            },
          }),
        );
      }
    } catch {
      // no-op to avoid blocking user updates when local storage is unavailable
    }
  };

  const hydrateProfileFromDb = async (nextAuthUserId, nextEmail) => {
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('user_id, role, email')
      .eq('auth_user_id', nextAuthUserId)
      .maybeSingle();

    if (userError && userError.code !== 'PGRST116') {
      throw userError;
    }

    const resolvedUserId = userRow?.user_id || null;
    setUserId(resolvedUserId);

    const nextRole = userRow?.role || profile.role;
    const nextResolvedEmail = userRow?.email || nextEmail || '';

    setProfile((prev) => ({
      ...prev,
      email: nextResolvedEmail,
      role: nextRole,
    }));

    let resolvedDetails = null;

    if (resolvedUserId) {
      const { data: detailsRow, error: detailsError } = await supabase
        .from('user_details')
        .select('first_name, middle_name, last_name, suffix, gender, photo_path')
        .eq('user_id', resolvedUserId)
        .maybeSingle();

      if (detailsError && detailsError.code !== 'PGRST116') {
        throw detailsError;
      }

      if (detailsRow) {
        resolvedDetails = detailsRow;
        const resolvedPhotoPath = detailsRow.photo_path || '';

        if (resolvedPhotoPath && !isAbsoluteUrl(resolvedPhotoPath)) {
          setAvatarStoragePath(resolvedPhotoPath);
        }

        setProfile((prev) => ({
          ...prev,
          firstName: detailsRow.first_name || prev.firstName,
          middleName: detailsRow.middle_name || '',
          lastName: detailsRow.last_name || prev.lastName,
          suffix: detailsRow.suffix || '',
          gender: normalizeGenderOption(detailsRow.gender || prev.gender),
          avatar: resolveAvatarUrl(resolvedPhotoPath) || prev.avatar,
          role: nextRole,
          email: nextResolvedEmail,
        }));
      }
    }

    pushUserProfileToShell({
      first_name: resolvedDetails?.first_name || profile.firstName,
      middle_name: resolvedDetails?.middle_name || profile.middleName,
      last_name: resolvedDetails?.last_name || profile.lastName,
      suffix: resolvedDetails?.suffix || profile.suffix,
      gender: resolvedDetails?.gender || mapGenderForStorage(profile.gender),
      photo_path: resolvedDetails?.photo_path || avatarStoragePath || null,
      role: nextRole,
      email: nextResolvedEmail,
    });
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      showToast('Supabase is not configured. Settings sync is disabled.');
      setIsProfileHydrated(true);
      return;
    }

    let isMounted = true;

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (error || !data?.session?.user?.id) {
        showToast('Could not load current account session.');
        return;
      }

      const currentUser = data.session.user;
      setAuthUserId(currentUser.id);
      setAuthEmail(currentUser.email || '');
      setSecurity((prev) => ({
        ...prev,
        twoFactorEnabled: currentUser.user_metadata?.mfaEnabled !== false,
      }));

      setProfile((prev) => ({
        ...prev,
        email: currentUser.email || prev.email,
      }));

      try {
        await hydrateProfileFromDb(currentUser.id, currentUser.email || '');
      } catch (hydrateError) {
        showToast(hydrateError.message || 'Failed to sync profile data.');
      } finally {
        setIsProfileHydrated(true);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user;
      if (!nextUser?.id) return;

      setAuthUserId(nextUser.id);
      setAuthEmail(nextUser.email || '');
      setSecurity((prev) => ({
        ...prev,
        twoFactorEnabled: nextUser.user_metadata?.mfaEnabled !== false,
      }));
      setProfile((prev) => ({ ...prev, email: nextUser.email || prev.email }));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleProfileImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setProfile((prev) => ({ ...prev, avatar: objectUrl }));

    if (!isSupabaseConfigured || !supabase || !authUserId) {
      showToast('Preview updated. Login and Supabase config are required to save image.');
      return;
    }

    try {
      const safeName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
      const filePath = `${authUserId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_pictures')
        .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from('profile_pictures')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) {
        throw new Error('Could not resolve uploaded profile image URL.');
      }

      setAvatarStoragePath(filePath);
      setProfile((prev) => ({ ...prev, avatar: publicUrl }));
      pushUserProfileToShell({
        first_name: profile.firstName,
        middle_name: profile.middleName,
        last_name: profile.lastName,
        suffix: profile.suffix,
        gender: mapGenderForStorage(profile.gender),
        photo_path: filePath,
        email: authEmail || profile.email,
        role: profile.role,
      });
      showToast('Profile picture uploaded to storage bucket.');
    } catch (error) {
      showToast(mapStorageUploadError(error?.message) || 'Failed to upload profile image to storage.');
    }
  };

  const handleBrandingAssetFileChange = async (field, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previousAssetUrl = brandingAssets[field] || '';
    const previousAssetPath =
      brandingAssetPaths[field === 'logoImage' ? 'logoImagePath' : 'loginBackgroundImagePath'] || '';
    const localPreview = URL.createObjectURL(file);
    setBrandingAssets((prev) => ({ ...prev, [field]: localPreview }));
    setBrandingUploadStatus((prev) => ({ ...prev, [field]: true }));

    if (!isSupabaseConfigured || !supabase || !authUserId) {
      setBrandingUploadStatus((prev) => ({ ...prev, [field]: false }));
      URL.revokeObjectURL(localPreview);
      showToast('You must be logged in with Supabase configured to upload branding assets.');
      return;
    }

    try {
      const safeName = file.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
      const assetFolder = field === 'logoImage' ? 'logo' : 'login-background';
      const filePath = `${authUserId}/${assetFolder}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error('Could not resolve uploaded branding image URL.');
      }

      setBrandingAssets((prev) => ({ ...prev, [field]: publicUrl }));
      setBrandingAssetPaths((prev) => ({
        ...prev,
        [field === 'logoImage' ? 'logoImagePath' : 'loginBackgroundImagePath']: filePath,
      }));
      showToast(`${field === 'logoImage' ? 'Logo' : 'Login background'} uploaded successfully.`);
    } catch (error) {
      setBrandingAssets((prev) => ({ ...prev, [field]: previousAssetUrl }));
      setBrandingAssetPaths((prev) => ({
        ...prev,
        [field === 'logoImage' ? 'logoImagePath' : 'loginBackgroundImagePath']: previousAssetPath,
      }));
      showToast(mapStorageUploadError(error?.message) || 'Failed to upload branding asset.');
    } finally {
      setBrandingUploadStatus((prev) => ({ ...prev, [field]: false }));
      URL.revokeObjectURL(localPreview);
    }
  };

  const ensureUserRow = async () => {
    if (userId) {
      return userId;
    }

    const { data: createdOrExistingUser, error } = await supabase
      .from('users')
      .upsert(
        {
          auth_user_id: authUserId,
          email: profile.email || authEmail,
          role: profile.role || 'Staff',
          is_active: true,
        },
        { onConflict: 'auth_user_id' },
      )
      .select('user_id')
      .single();

    if (error || !createdOrExistingUser?.user_id) {
      throw error || new Error('Unable to load profile user row.');
    }

    setUserId(createdOrExistingUser.user_id);
    return createdOrExistingUser.user_id;
  };

  const appendSecurityLog = async (action, description, resource = 'security/settings') => {
    const targetUserId = userId || await ensureUserRow();

    const result = await logAuditAction({
      action,
      description,
      resource,
      status: 'success',
    });

    if (result.logged) {
      await loadSecurityActivity(targetUserId);
    }
  };

  const handleSaveProfile = async () => {
    if (!isSupabaseConfigured || !supabase || !authUserId) {
      showToast('You must be logged in to update profile settings.');
      return;
    }

    try {
      const ensuredUserId = await ensureUserRow();

      const { error: userUpdateError } = await supabase
        .from('users')
        .update({ email: profile.email || authEmail })
        .eq('user_id', ensuredUserId);

      if (userUpdateError) {
        throw userUpdateError;
      }

      const { data: existingDetails, error: detailsLookupError } = await supabase
        .from('user_details')
        .select('user_details_id')
        .eq('user_id', ensuredUserId)
        .maybeSingle();

      if (detailsLookupError) {
        throw detailsLookupError;
      }

      const safePhotoPath =
        avatarStoragePath || (profile.avatar && profile.avatar.length <= 255 ? profile.avatar : null);

      const detailsPayload = {
        user_id: ensuredUserId,
        first_name: profile.firstName || null,
        middle_name: profile.middleName || null,
        last_name: profile.lastName || null,
        suffix: profile.suffix || null,
        gender: mapGenderForStorage(profile.gender),
        photo_path: safePhotoPath,
      };

      if (existingDetails?.user_details_id) {
        const { error: updateError } = await supabase
          .from('user_details')
          .update(detailsPayload)
          .eq('user_details_id', existingDetails.user_details_id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase.from('user_details').insert(detailsPayload);

        if (insertError) {
          throw insertError;
        }
      }

      setProfile((prev) => ({
        ...prev,
        gender: normalizeGenderOption(prev.gender),
      }));

      pushUserProfileToShell({
        email: authEmail || profile.email,
        role: profile.role,
        first_name: profile.firstName,
        last_name: profile.lastName,
        photo_path: safePhotoPath,
      });

      showToast('Profile settings updated in real time.');
    } catch (saveError) {
      showToast(saveError?.message || 'Failed to save profile settings.');
    }
  };

  const validateCurrentPassword = async () => {
    const loginEmail = authEmail || profile.email;
    if (!loginEmail || !security.currentPassword) {
      throw new Error('Current password is required.');
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: security.currentPassword,
    });

    if (error) {
      throw new Error('Current password is incorrect.');
    }
  };

  const handleRequestPasswordOtp = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showToast('Supabase is not configured.');
      return;
    }

    if (!security.currentPassword) {
      showToast('Current password is required.');
      return;
    }

    if (!security.newPassword || !security.confirmPassword) {
      showToast('New password and confirmation are required.');
      return;
    }

    if (!isPasswordChecklistComplete) {
      showToast('New password does not meet all requirements.');
      return;
    }

    if (security.newPassword !== security.confirmPassword) {
      showToast('New password and confirmation do not match.');
      return;
    }

    try {
      await validateCurrentPassword();
      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        throw error;
      }

      setIsOtpSent(true);
      setPasswordMfaRequired(false);
      setPasswordMfaCode('');
      setPasswordMfaFactorId('');
      setSecurity((prev) => ({ ...prev, passwordOtp: '' }));
      showToast('Reauthentication OTP sent to your email.');
    } catch (otpError) {
      showToast(otpError?.message || 'Unable to send OTP for password change.');
    }
  };

  const resolvePasswordMfaFactor = async () => {
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      throw factorsError;
    }

    const verifiedTotp = (factorsData?.totp || []).find((factor) => factor.status === 'verified');
    if (!verifiedTotp?.id) {
      throw new Error('MFA is enabled but no verified authenticator factor was found.');
    }

    return verifiedTotp.id;
  };

  const completePasswordUpdateWithNonce = async (otpValue) => {
    const { error } = await supabase.auth.updateUser({
      password: security.newPassword,
      nonce: otpValue,
    });

    if (error) {
      throw error;
    }
  };

  const finalizePasswordUpdateSuccess = () => {
    void appendSecurityLog('security.password_update', 'Updated account password.', 'security/password');
    setSecurity((prev) => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      passwordOtp: '',
    }));
    setIsOtpSent(false);
    setPasswordMfaRequired(false);
    setPasswordMfaCode('');
    setPasswordMfaFactorId('');
    setShowPasswordSuccessModal(true);
    showToast('Password updated successfully.');
  };

  const handleVerifyPasswordMfaAndRetry = async (mfaCodeValue) => {
    if (!passwordMfaRequired || !passwordMfaFactorId || !mfaCodeValue || mfaCodeValue.length < 6 || isVerifyingPasswordMfa) {
      return;
    }

    setIsVerifyingPasswordMfa(true);

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: passwordMfaFactorId,
      });

      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: passwordMfaFactorId,
        challengeId: challengeData.id,
        code: mfaCodeValue,
      });

      if (verifyError) {
        throw verifyError;
      }

      await completePasswordUpdateWithNonce(security.passwordOtp.trim());
      finalizePasswordUpdateSuccess();
    } catch (error) {
      showToast(error?.message || 'Authenticator verification failed.');
    } finally {
      setIsVerifyingPasswordMfa(false);
    }
  };

  const handleVerifyPasswordOtpAndUpdate = async (otpValue) => {
    if (!otpValue || otpValue.length < 6 || isVerifyingPasswordOtp) {
      return;
    }

    setIsVerifyingPasswordOtp(true);
    try {
      await completePasswordUpdateWithNonce(otpValue);
      finalizePasswordUpdateSuccess();
    } catch (verifyError) {
      const message = String(verifyError?.message || '');
      if (message.toLowerCase().includes('aal2 session is required')) {
        try {
          const factorId = await resolvePasswordMfaFactor();
          setPasswordMfaFactorId(factorId);
          setPasswordMfaRequired(true);
          setPasswordMfaCode('');
          showToast('Authenticator verification is required. Enter your 6-digit app code below.');
        } catch (mfaError) {
          showToast(mfaError?.message || 'MFA is required but could not be started.');
        }
      } else {
        showToast(verifyError?.message || 'Invalid OTP. Please try again.');
      }
    } finally {
      setIsVerifyingPasswordOtp(false);
    }
  };

  useEffect(() => {
    if (!isOtpSent || !security.passwordOtp || security.passwordOtp.length < 6) {
      return;
    }

    handleVerifyPasswordOtpAndUpdate(security.passwordOtp.trim());
  }, [security.passwordOtp, isOtpSent]);

  useEffect(() => {
    if (!passwordMfaRequired || !passwordMfaCode || passwordMfaCode.length < 6) {
      return;
    }

    handleVerifyPasswordMfaAndRetry(passwordMfaCode.trim());
  }, [passwordMfaCode, passwordMfaRequired]);

  const persistMfaPreference = async (enabled) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentMetadata = sessionData?.session?.user?.user_metadata || {};

    const { error } = await supabase.auth.updateUser({
      data: {
        ...currentMetadata,
        mfaEnabled: enabled,
      },
    });

    if (error) {
      throw error;
    }
  };

  const startMfaEnrollment = async () => {
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      throw factorsError;
    }

    const unverifiedFactors = (factorsData?.totp || []).filter((factor) => factor.status !== 'verified');
    for (const factor of unverifiedFactors) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Google Authenticator',
      issuer: 'StrandShare',
    });

    if (enrollError || !enrollData?.id) {
      throw enrollError || new Error('Unable to start Google Authenticator enrollment.');
    }

    setMfaSetup({
      enrolling: true,
      factorId: enrollData.id,
      qrSvg: enrollData?.totp?.qr_code || '',
      secret: enrollData?.totp?.secret || '',
      code: '',
    });
    showToast('Scan the QR code in Google Authenticator and enter the 6-digit code.');
  };

  const verifyMfaEnrollment = async (codeValue) => {
    if (!mfaSetup.factorId || !codeValue || codeValue.length < 6 || isVerifyingMfaCode) {
      return;
    }

    setIsVerifyingMfaCode(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaSetup.factorId,
      });

      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaSetup.factorId,
        challengeId: challengeData.id,
        code: codeValue,
      });

      if (verifyError) {
        throw verifyError;
      }

      await persistMfaPreference(true);
      setSecurity((prev) => ({ ...prev, twoFactorEnabled: true }));
      setMfaSetup({ enrolling: false, factorId: '', qrSvg: '', secret: '', code: '' });
      void appendSecurityLog('security.2fa_enable', 'Enabled two-factor authentication.', 'security/2fa');
      showToast('Google Authenticator is now enabled.');
    } catch (error) {
      showToast(error?.message || 'Invalid authenticator code.');
    } finally {
      setIsVerifyingMfaCode(false);
    }
  };

  useEffect(() => {
    if (!mfaSetup.enrolling || !mfaSetup.code || mfaSetup.code.length < 6) {
      return;
    }

    verifyMfaEnrollment(mfaSetup.code.trim());
  }, [mfaSetup.code, mfaSetup.enrolling]);

  const handleToggleTwoFactor = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showToast('Supabase is not configured.');
      return;
    }

    try {
      if (security.twoFactorEnabled) {
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) {
          throw factorsError;
        }

        const allTotpFactors = factorsData?.totp || [];
        for (const factor of allTotpFactors) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }

        await persistMfaPreference(false);
        setSecurity((prev) => ({ ...prev, twoFactorEnabled: false }));
        setMfaSetup({ enrolling: false, factorId: '', qrSvg: '', secret: '', code: '' });
        void appendSecurityLog('security.2fa_disable', 'Disabled two-factor authentication.', 'security/2fa');
        showToast('Google Authenticator has been disabled.');
        return;
      }

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        throw factorsError;
      }

      const verifiedFactor = (factorsData?.totp || []).find((factor) => factor.status === 'verified');
      if (verifiedFactor) {
        await persistMfaPreference(true);
        setSecurity((prev) => ({ ...prev, twoFactorEnabled: true }));
        void appendSecurityLog('security.2fa_enable', 'Enabled two-factor authentication.', 'security/2fa');
        showToast('Google Authenticator is now enabled.');
        return;
      }

      await startMfaEnrollment();
    } catch (toggleError) {
      showToast(toggleError?.message || 'Unable to update two-factor authentication.');
    }
  };

  const handleSave = async () => {
    if (activeTab === 'profile') {
      await handleSaveProfile();
      return;
    }

    if (activeTab === 'security') {
      if (!security.newPassword && !security.confirmPassword && !security.currentPassword) {
        showToast('Security changes are already up to date.');
        return;
      }

      await handleRequestPasswordOtp();
      return;
    }

    if (activeTab === 'branding') {
      if (brandingUploadStatus.logoImage || brandingUploadStatus.loginBackgroundImage) {
        showToast('Please wait for branding uploads to finish before saving.');
        return;
      }

      const resolvedLogoImage = brandingAssetPaths.logoImagePath
        ? getStoragePublicUrl(BRANDING_BUCKET, brandingAssetPaths.logoImagePath)
        : brandingAssets.logoImage;
      const resolvedLoginBackgroundImage = brandingAssetPaths.loginBackgroundImagePath
        ? getStoragePublicUrl(BRANDING_BUCKET, brandingAssetPaths.loginBackgroundImagePath)
        : brandingAssets.loginBackgroundImage;

      if (isBlobUrl(resolvedLogoImage) || isBlobUrl(resolvedLoginBackgroundImage)) {
        showToast('Branding image is still local only. Re-upload it and wait for upload success before saving.');
        return;
      }

      const brandingThemePayload = {
        primaryColor: tempColors.primary,
        primaryColorDark: tempColors.primaryDark,
        primaryColorLight: tempColors.primaryLight,
        secondaryColor: tempColors.secondary,
        secondaryColorDark: tempColors.secondaryDark,
        secondaryColorLight: tempColors.secondaryLight,
        tertiaryColor: tempColors.tertiary,
        tertiaryColorDark: tempColors.tertiaryDark,
        tertiaryColorLight: tempColors.tertiaryLight,
        brandName: brandingMeta.brandName,
        brandTagline: brandingMeta.brandTagline,
        logoImage: resolvedLogoImage,
        logoImagePath: brandingAssetPaths.logoImagePath,
        loginBackgroundImage: resolvedLoginBackgroundImage,
        loginBackgroundImagePath: brandingAssetPaths.loginBackgroundImagePath,
      };

      const { error } = await saveThemeGlobally(brandingThemePayload);
      if (error) {
        showToast(error.message || 'Failed to save global branding settings.');
      } else {
        showToast('Global branding updated for all users.');
      }
      return;
    }

    if (activeTab === 'system') {
      showToast('System preferences saved.');
      return;
    }

    if (activeTab === 'notifications') {
      showToast('Notification preferences saved.');
      return;
    }

    showToast('Changes saved.');
  };

  const handleDiscard = async () => {
    if (activeTab === 'profile' && authUserId) {
      try {
        await hydrateProfileFromDb(authUserId, authEmail);
      } catch {
        // ignore errors during discard refresh
      }
    }

    if (activeTab === 'security') {
      setSecurity((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        passwordOtp: '',
      }));
      setIsOtpSent(false);
      setPasswordMfaRequired(false);
      setPasswordMfaCode('');
      setPasswordMfaFactorId('');
      setMfaSetup((prev) => ({ ...prev, enrolling: false, factorId: '', qrSvg: '', secret: '', code: '' }));
    }

    if (activeTab === 'branding') {
      setTempColors({
        primary: theme.primaryColor,
        primaryDark: theme.primaryColorDark,
        primaryLight: theme.primaryColorLight,
        secondary: theme.secondaryColor,
        secondaryDark: theme.secondaryColorDark,
        secondaryLight: theme.secondaryColorLight,
        tertiary: theme.tertiaryColor,
        tertiaryDark: theme.tertiaryColorDark,
        tertiaryLight: theme.tertiaryColorLight,
        fontPrimary: '#0f172a',
        fontSecondary: '#64748b',
      });
      setSelectedThemeId('default-theme');
      setBrandingMeta((prev) => ({
        ...prev,
        brandName: theme.brandName || 'StrandShare',
        brandTagline: theme.brandTagline || 'Every Strand Counts',
      }));
      setBrandingAssets({
        logoImage: theme.logoImage || '',
        loginBackgroundImage: theme.loginBackgroundImage || '',
      });
      setBrandingAssetPaths({
        logoImagePath: theme.logoImagePath || '',
        loginBackgroundImagePath: theme.loginBackgroundImagePath || '',
      });
    }

    if (activeTab === 'system') {
      setSystemPreferences({
        language: 'en',
        timezone: 'Asia/Manila',
        maintenanceMode: false,
      });
    }

    if (activeTab === 'notifications') {
      setNotifications({
        email: true,
        push: false,
      });
    }

    showToast('Changes discarded.');
  };

  const applyPreset = (preset) => {
    if (!preset.colors) {
      return;
    }
    setTempColors({ ...preset.colors });
    setSelectedThemeId(preset.id);
    showToast(`${preset.name} theme loaded.`);
  };

  const activeTabStyle = (tabId) =>
    activeTab === tabId
      ? { color: theme.primaryColor, borderBottomColor: theme.primaryColor }
      : undefined;

  return (
    <div className="w-full">
      <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-8">
        <div className="mb-8">
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">System Settings</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Configure global platform parameters and visual identity.</p>
          </div>
        </div>

        <div className="mb-6 border-b border-slate-200 dark:border-slate-800 overflow-x-auto tab-strip-scroll">
          <nav className="flex gap-8 min-w-max pr-6">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="pb-4 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 whitespace-nowrap"
                style={activeTabStyle(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'profile' && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Profile Settings</h3>
            </div>

            <div className="p-5 grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-3 flex items-center justify-center py-2">
                <div className="relative">
                  <img
                    src={profile.avatar || (isProfileHydrated ? DEFAULT_AVATAR : 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')}
                    alt="Profile"
                    className="w-28 h-28 rounded-full border-2 border-slate-200 object-cover shadow-sm"
                  />
                  <label
                    className="absolute bottom-1 right-1 w-8 h-8 rounded-full text-white flex items-center justify-center cursor-pointer shadow"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    <Upload size={14} />
                    <input type="file" accept="image/*" className="hidden" onChange={handleProfileImage} />
                  </label>
                </div>
              </div>

              <div className="col-span-12 md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">First Name</label>
                  <input
                    value={profile.firstName}
                    onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Middle Name</label>
                  <input
                    value={profile.middleName}
                    onChange={(e) => setProfile({ ...profile, middleName: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Last Name</label>
                  <input
                    value={profile.lastName}
                    onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Suffix</label>
                  <input
                    value={profile.suffix}
                    onChange={(e) => setProfile({ ...profile, suffix: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Gender</label>
                  <select
                    value={profile.gender}
                    onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Role</label>
                  <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {formatRoleLabel(profile.role)}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Email Address</label>
                  <input
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-4">
              <button type="button" onClick={handleDiscard} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Discard Changes
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <Save size={14} />
                Save All Changes
              </button>
            </div>
          </section>
        )}

        {activeTab === 'security' && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Update Password</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={security.currentPassword}
                      onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Password Requirements</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {[
                      ['At least 8 characters', passwordRuleChecks.minLength],
                      ['One uppercase letter', passwordRuleChecks.uppercase],
                      ['One lowercase letter', passwordRuleChecks.lowercase],
                      ['One number', passwordRuleChecks.number],
                      ['One special character', passwordRuleChecks.special],
                    ].map(([label, passed]) => (
                      <div key={label} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        {passed ? <Check size={14} className="text-emerald-600" /> : <X size={14} className="text-red-500" />}
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={security.newPassword}
                        onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={security.confirmPassword}
                        onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 pr-10 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {(security.newPassword || security.confirmPassword) && (
                  <div className="text-sm font-medium">
                    {security.newPassword === security.confirmPassword && security.confirmPassword ? (
                      <span className="text-emerald-600">Matched</span>
                    ) : (
                      <span className="text-red-500">Mismatched</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRequestPasswordOtp}
                    className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    Change Password
                  </button>
                  {isOtpSent && <span className="text-xs text-slate-500">OTP sent to your email. Enter it below to finish.</span>}
                </div>

                {isOtpSent && (
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Email OTP (Auto verify on 6 digits)</label>
                    <input
                      value={security.passwordOtp}
                      onChange={(e) => setSecurity({ ...security, passwordOtp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      inputMode="numeric"
                      placeholder="Enter 6-digit OTP"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm tracking-[0.3em]"
                    />
                    {isVerifyingPasswordOtp && <p className="text-xs mt-2 text-slate-500">Verifying OTP...</p>}
                  </div>
                )}

                {passwordMfaRequired && (
                  <div>
                    <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Authenticator Code (Auto verify on 6 digits)</label>
                    <input
                      value={passwordMfaCode}
                      onChange={(e) => setPasswordMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      placeholder="Enter 6-digit authenticator code"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm tracking-[0.3em]"
                    />
                    {isVerifyingPasswordMfa && <p className="text-xs mt-2 text-slate-500">Verifying authenticator code...</p>}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Two-Factor Authentication</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Require OTP verification on sign in.</p>
                </div>
                <Toggle
                  checked={security.twoFactorEnabled}
                  onChange={handleToggleTwoFactor}
                  activeColor={theme.primaryColor}
                />
              </div>

              {mfaSetup.enrolling && (
                <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Google Authenticator Setup</p>
                  {mfaSetup.qrSvg && (
                    <div className="bg-white inline-block p-2 rounded border border-slate-200" dangerouslySetInnerHTML={{ __html: mfaSetup.qrSvg }} />
                  )}
                  {mfaSetup.secret && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Manual key: <span className="font-mono text-slate-700 dark:text-slate-200">{mfaSetup.secret}</span>
                    </p>
                  )}
                  <input
                    value={mfaSetup.code}
                    onChange={(e) =>
                      setMfaSetup((prev) => ({
                        ...prev,
                        code: e.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                    placeholder="Enter 6-digit code"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm tracking-[0.3em]"
                  />
                  {isVerifyingMfaCode && <p className="text-xs text-slate-500">Verifying authenticator code...</p>}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h4 className="font-bold text-slate-900 dark:text-white mb-3">Active Sessions</h4>
              <div className="space-y-3">
                {security.activeSessions.length === 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-500 dark:text-slate-400">
                    No active sessions recorded yet.
                  </div>
                )}
                {security.activeSessions.map((session) => (
                  <div key={session.device + session.lastActive} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{session.device}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{session.location} • {session.lastActive}</p>
                    </div>
                    {session.current && (
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${theme.primaryColor}22`, color: theme.primaryColor }}>
                        Current
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h4 className="font-bold text-slate-900 dark:text-white mb-3">Log Sessions</h4>
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2">IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.loginSessions.length === 0 && (
                      <tr className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-2 pr-3 text-slate-500 dark:text-slate-400" colSpan={3}>
                          No security activity logs yet.
                        </td>
                      </tr>
                    )}
                    {security.loginSessions.map((log) => (
                      <tr key={log.time + log.action} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{log.time}</td>
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{log.action}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-300">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        )}

        {activeTab === 'system' && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">System Preferences</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Language</label>
                <select
                  value={systemPreferences.language}
                  onChange={(e) => setSystemPreferences({ ...systemPreferences, language: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1.5">Timezone</label>
                <select
                  value={systemPreferences.timezone}
                  onChange={(e) => setSystemPreferences({ ...systemPreferences, timezone: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm"
                >
                  <option value="Asia/Manila">Asia/Manila</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
              <div className="md:col-span-2 mt-1">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">Maintenance Mode</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Temporarily disable user access while admins perform updates.
                    </p>
                  </div>
                  <Toggle
                    checked={systemPreferences.maintenanceMode}
                    onChange={() =>
                      setSystemPreferences({
                        ...systemPreferences,
                        maintenanceMode: !systemPreferences.maintenanceMode,
                      })
                    }
                    activeColor={theme.primaryColor}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <button type="button" onClick={handleDiscard} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Discard System Changes
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <Save size={14} />
                Save System Changes
              </button>
            </div>
          </section>
        )}

        {activeTab === 'notifications' && (
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Notifications</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Email Notifications</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Receive updates through email.</p>
                </div>
                <Toggle
                  checked={notifications.email}
                  onChange={() => setNotifications({ ...notifications, email: !notifications.email })}
                  activeColor={theme.primaryColor}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Push Notifications</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Receive browser and mobile push notifications.</p>
                </div>
                <Toggle
                  checked={notifications.push}
                  onChange={() => setNotifications({ ...notifications, push: !notifications.push })}
                  activeColor={theme.primaryColor}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <button type="button" onClick={handleDiscard} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Discard Notification Changes
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <Save size={14} />
                Save Notification Changes
              </button>
            </div>
          </section>
        )}

        {activeTab === 'branding' && (
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-7 space-y-8">
              <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Available Themes</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {BRAND_PRESETS.map((preset) => {
                      const isActive = preset.id === selectedThemeId;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="group relative aspect-[4/3] rounded-lg border-2 p-2 overflow-hidden transition-all"
                          style={
                            isActive
                              ? {
                                  borderColor: tempColors.primary,
                                  backgroundColor: `${tempColors.primary}0d`,
                                  boxShadow: `0 0 0 2px ${tempColors.primary}33`,
                                }
                              : { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }
                          }
                        >
                          {preset.id !== 'custom' ? (
                            <div className="w-full h-full rounded border border-slate-200 bg-white dark:bg-slate-900 flex flex-col p-2 gap-2">
                              <div className="flex gap-1.5 h-7">
                                <div className="flex-1 rounded" style={{ backgroundColor: preset.colors.primary }} />
                                <div className="flex-1 rounded" style={{ backgroundColor: preset.colors.secondary }} />
                                <div className="flex-1 rounded" style={{ backgroundColor: preset.colors.primaryLight }} />
                              </div>
                              <div className="grid grid-cols-2 gap-1 h-4">
                                <div className="rounded bg-white border border-slate-100" />
                                <div className="rounded" style={{ backgroundColor: preset.colors.tertiary }} />
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-full rounded border border-dashed border-slate-300 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-slate-500 text-[10px] font-bold uppercase">
                              Custom
                            </div>
                          )}
                          {preset.badge && (
                            <span className="absolute right-2 top-2 rounded bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white">{preset.badge}</span>
                          )}
                          <div className="absolute inset-x-2 bottom-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                            {preset.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Custom Theme Settings</h3>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    {BRANDING_EDITOR_TABS.map((tab) => {
                      const isActive = brandingEditorTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setBrandingEditorTab(tab.id)}
                          className={`px-3 py-1 text-xs rounded ${isActive ? 'font-bold bg-white dark:bg-slate-700 shadow-sm' : 'font-medium text-slate-500 dark:text-slate-400'}`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  {brandingEditorTab === 'colors' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Primary Color</label>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ backgroundColor: tempColors.primary }} />
                          <input
                            value={tempColors.primary}
                            onChange={(e) => setTempColors({ ...tempColors, primary: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Secondary Color</label>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ backgroundColor: tempColors.secondary }} />
                          <input
                            value={tempColors.secondary}
                            onChange={(e) => setTempColors({ ...tempColors, secondary: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Tertiary Color</label>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ backgroundColor: tempColors.tertiary }} />
                          <input
                            value={tempColors.tertiary}
                            onChange={(e) => setTempColors({ ...tempColors, tertiary: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Font Primary Color</label>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ backgroundColor: tempColors.fontPrimary }} />
                          <input
                            value={tempColors.fontPrimary}
                            onChange={(e) => setTempColors({ ...tempColors, fontPrimary: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-2 space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Font Secondary Color</label>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ backgroundColor: tempColors.fontSecondary }} />
                          <input
                            value={tempColors.fontSecondary}
                            onChange={(e) => setTempColors({ ...tempColors, fontSecondary: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {brandingEditorTab === 'typography' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Primary Font Family</label>
                        <input
                          value={brandingMeta.primaryFontFamily}
                          onChange={(e) => setBrandingMeta({ ...brandingMeta, primaryFontFamily: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Secondary Font Family</label>
                        <input
                          value={brandingMeta.secondaryFontFamily}
                          onChange={(e) => setBrandingMeta({ ...brandingMeta, secondaryFontFamily: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Typography Preview</p>
                        <h4 className="text-lg font-bold" style={{ color: tempColors.fontPrimary, fontFamily: brandingMeta.primaryFontFamily }}>
                          Analytics Overview
                        </h4>
                        <p className="text-sm mt-1" style={{ color: tempColors.fontSecondary, fontFamily: brandingMeta.secondaryFontFamily }}>
                          Real-time performance data and engagement metrics
                        </p>
                      </div>
                    </div>
                  )}

                  {brandingEditorTab === 'branding' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Brand Name</label>
                        <input
                          value={brandingMeta.brandName}
                          onChange={(e) => setBrandingMeta({ ...brandingMeta, brandName: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Brand Tagline</label>
                        <input
                          value={brandingMeta.brandTagline}
                          onChange={(e) => setBrandingMeta({ ...brandingMeta, brandTagline: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Upload Logo Image</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBrandingAssetFileChange('logoImage', e)}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Upload Login Background</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleBrandingAssetFileChange('loginBackgroundImage', e)}
                          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950"
                        />
                      </div>

                      <div className="sm:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-950">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Current Logo</p>
                          <img
                            src={brandingAssets.logoImage || theme.logoImage || DEFAULT_AVATAR}
                            alt="Logo preview"
                            className="w-24 h-24 rounded-lg object-cover border border-slate-200"
                          />
                        </div>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-950">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Current Login Background</p>
                          <img
                            src={brandingAssets.loginBackgroundImage || theme.loginBackgroundImage || DEFAULT_AVATAR}
                            alt="Login background preview"
                            className="w-full h-24 rounded-lg object-cover border border-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <div className="sticky top-24">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Eye size={16} />
                    Live Theme Preview
                  </h4>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPreviewView('login')}
                      className="px-3 py-1.5 text-[11px] font-bold"
                      style={previewView === 'login' ? { backgroundColor: `${tempColors.primary}20`, color: tempColors.primary } : { color: '#64748b' }}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewView('home')}
                      className="px-3 py-1.5 text-[11px] font-bold"
                      style={previewView === 'home' ? { backgroundColor: `${tempColors.primary}20`, color: tempColors.primary } : { color: '#64748b' }}
                    >
                      Home
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-1 shadow-2xl overflow-hidden border-8 border-slate-800">
                  {previewView === 'login' ? (
                    <div className="bg-white dark:bg-slate-900 rounded-lg aspect-[16/10] overflow-hidden" style={previewStyle}>
                      <div className="h-full w-full grid grid-cols-12">
                        <div
                          className="col-span-5 hidden sm:flex items-center justify-center p-3"
                          style={{
                            background: `linear-gradient(135deg, ${tempColors.primaryLight}15 0%, ${tempColors.primary}10 50%, ${tempColors.primaryDark}15 100%)`,
                          }}
                        >
                          <div className="w-full max-w-[170px]">
                            <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200 mb-3">
                              <img
                                src={brandingAssets.loginBackgroundImage || theme.loginBackgroundImage || DEFAULT_AVATAR}
                                alt="Login preview background"
                                className="w-full h-24 object-cover"
                              />
                            </div>
                            <h4 className="text-[10px] font-bold text-center" style={{ color: tempColors.primary }}>
                              {brandingMeta.brandTagline || theme.brandTagline || 'Every Strand Counts'}
                            </h4>
                          </div>
                        </div>

                        <div className="col-span-12 sm:col-span-7 p-3 bg-white">
                          <div className="flex items-center gap-2 mb-3">
                            <img
                              src={brandingAssets.logoImage || theme.logoImage || DEFAULT_AVATAR}
                              alt="Logo preview"
                              className="w-7 h-7 rounded object-cover border border-slate-200"
                            />
                            <span className="text-[11px] font-bold text-slate-900">
                              {brandingMeta.brandName || theme.brandName || 'StrandShare'}
                            </span>
                          </div>

                          <div className="h-2 w-24 rounded mb-1" style={{ backgroundColor: tempColors.fontPrimary }} />
                          <div className="h-1.5 w-32 rounded mb-3" style={{ backgroundColor: tempColors.fontSecondary }} />

                          <div className="space-y-2">
                            <div className="h-6 rounded border border-slate-200 bg-slate-50" />
                            <div className="h-6 rounded border border-slate-200 bg-slate-50" />
                            <div className="h-6 rounded" style={{ backgroundColor: tempColors.primary }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#f4f7fb] rounded-lg aspect-[16/10] overflow-hidden border border-slate-200 flex text-[8px]">
                      <div className="w-[30%] bg-white border-r border-slate-200 flex flex-col">
                        <div className="h-8 px-2.5 flex items-center gap-2 border-b border-slate-100">
                          <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: tempColors.primary }} />
                          <div className="h-1.5 w-12 rounded" style={{ backgroundColor: tempColors.fontPrimary }} />
                        </div>
                        <div className="p-2.5 space-y-2">
                          <div className="h-3.5 rounded-md flex items-center px-1.5" style={{ backgroundColor: `${tempColors.primary}20` }}>
                            <div className="h-1.5 w-8 rounded" style={{ backgroundColor: tempColors.primary }} />
                          </div>
                          <div className="h-3.5 rounded-md bg-slate-100" />
                          <div className="h-3.5 rounded-md bg-slate-100" />
                        </div>
                      </div>

                      <div className="flex-1 p-3">
                        <div className="h-5 flex items-center justify-between mb-3">
                          <div>
                            <div className="h-2 w-16 rounded mb-1" style={{ backgroundColor: tempColors.fontPrimary }} />
                            <div className="h-1.5 w-20 rounded" style={{ backgroundColor: tempColors.fontSecondary }} />
                          </div>
                          <div className="h-3.5 w-12 rounded-md" style={{ backgroundColor: tempColors.primary }} />
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {[tempColors.primary, tempColors.secondary, '#f59e0b'].map((cardColor) => (
                            <div key={cardColor} className="bg-white border border-slate-200 rounded-lg p-2">
                              <div className="h-2 w-2 rounded mb-2" style={{ backgroundColor: `${cardColor}33` }} />
                              <div className="h-1.5 w-10 rounded mb-1" style={{ backgroundColor: tempColors.fontSecondary }} />
                              <div className="h-2.5 w-8 rounded" style={{ backgroundColor: cardColor }} />
                            </div>
                          ))}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-lg p-2">
                          <div className="h-1.5 w-12 rounded mb-2" style={{ backgroundColor: tempColors.fontPrimary }} />
                          <div className="h-4 rounded bg-slate-100 mb-2" />
                          <div className="h-4 rounded bg-slate-100" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-4 italic">
                  Changes are reflected in real-time as you customize {previewView} preview.
                </p>
              </div>
            </div>

            <div className="col-span-12 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <button type="button" onClick={handleDiscard} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Discard Branding Changes
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                <Save size={14} />
                Save Branding Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {showPasswordSuccessModal && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6">
            <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Password Updated</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Your password was changed successfully after OTP verification.
            </p>
            <button
              type="button"
              onClick={() => setShowPasswordSuccessModal(false)}
              className="w-full py-2.5 rounded-lg text-white font-semibold"
              style={{ backgroundColor: theme.primaryColor }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 px-4 py-2.5 text-sm font-semibold shadow-lg dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-100">
          {toast}
        </div>
      )}

      <style>{`
        .tab-strip-scroll {
          scrollbar-width: thin;
          scrollbar-color: #94a3b8 transparent;
        }

        .tab-strip-scroll::-webkit-scrollbar {
          height: 8px;
        }

        .tab-strip-scroll::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
