import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Search, Bell, MessageSquare, LogOut, ChevronDown, Settings } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const DEFAULT_PROFILE_AVATAR =
  'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=400&q=80';

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function resolveProfileAvatar(userProfile) {
  const profileImage = userProfile?.photo_url || userProfile?.photo_path || '';

  if (!profileImage) {
    return DEFAULT_PROFILE_AVATAR;
  }

  if (isAbsoluteUrl(profileImage)) {
    return profileImage;
  }

  if (isSupabaseConfigured && supabase) {
    const { data } = supabase.storage.from('profile_pictures').getPublicUrl(profileImage);
    return data?.publicUrl || DEFAULT_PROFILE_AVATAR;
  }

  return DEFAULT_PROFILE_AVATAR;
}

function resolveDisplayName(userProfile) {
  const firstName = String(userProfile?.first_name || '').trim();
  const lastName = String(userProfile?.last_name || '').trim();
  const suffix = String(userProfile?.suffix || '').trim();

  const nameParts = [firstName, lastName, suffix].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(' ');
  }

  if (userProfile?.email) {
    return userProfile.email.split('@')[0];
  }

  return 'User';
}

function resolveDisplayRole(roleValue) {
  const normalizedRole = String(roleValue || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

  if (!normalizedRole) {
    return 'User';
  }

  if (normalizedRole === 'hospital' || normalizedRole === 'h staff' || normalizedRole === 'hstaff') {
    return 'H-Staff';
  }

  if (normalizedRole === 'super admin' || normalizedRole === 'superadmin') {
    return 'Super Admin';
  }

  if (normalizedRole === 'partner' || normalizedRole === 'partners') {
    return 'Partner';
  }

  if (normalizedRole === 'staff') {
    return 'Staff';
  }

  return roleValue;
}

export default function Header({ onSignOut, onOpenSettings, userProfile, pageTitle = 'Overview' }) {
  const { theme } = useTheme();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [avatarHasError, setAvatarHasError] = useState(false);
  const displayName = resolveDisplayName(userProfile);
  const displayRole = resolveDisplayRole(userProfile?.role);
  const displayEmail = userProfile?.email || 'No email available';
  const resolvedAvatar = useMemo(() => resolveProfileAvatar(userProfile), [userProfile]);
  const avatarSrc = avatarHasError ? DEFAULT_PROFILE_AVATAR : resolvedAvatar;

  useEffect(() => {
    setAvatarHasError(false);
  }, [resolvedAvatar]);

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut();
    }
    setShowSignOutConfirm(false);
    setShowProfileDropdown(false);
  };

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
    }
    setShowSignOutConfirm(false);
    setShowProfileDropdown(false);
  };

  return (
    <div className="h-20 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
      {/* Left - Title */}
      <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>

      {/* Middle - Search Bar */}
      <div className="flex-1 max-w-xs mx-6 ml-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search systems..."
            className="w-full pl-12 pr-4 py-2.5 border border-gray-300 rounded-full bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-offset-2"
            style={{ '--tw-ring-color': theme.primaryColor }}
          />
        </div>
      </div>

      {/* Right - Icons & Profile */}
      <div className="flex items-center gap-6">
        {/* Bell Icon */}
        <button className="relative hover:opacity-80 transition-opacity">
          <Bell size={24} className="text-gray-600" />
          <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></div>
        </button>

        {/* Message Icon */}
        <button className="hover:opacity-80 transition-opacity">
          <MessageSquare size={24} className="text-gray-600" />
        </button>

        {/* Profile Section */}
        <div className="flex items-center gap-3 pl-6 border-l border-gray-200 relative">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{displayName}</p>
            <p className="text-xs" style={{ color: theme.primaryColor }}>
              {displayRole}
            </p>
          </div>
          <button
            onClick={() => {
              setShowProfileDropdown((prev) => !prev);
              setShowSignOutConfirm(false);
            }}
            className="relative group"
          >
            <img
              src={avatarSrc}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover hover:ring-2 hover:ring-offset-2 transition-all"
              onError={() => setAvatarHasError(true)}
              style={{ '--tw-ring-color': theme.primaryColor }}
            />
            <ChevronDown
              size={16}
              className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 text-gray-600"
            />
          </button>

          {/* Dropdown Menu */}
          {showProfileDropdown && (
            <div className="absolute right-0 top-16 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-start gap-3">
                  <img
                    src={avatarSrc}
                    alt="Profile"
                    className="w-12 h-12 rounded-full object-cover border border-gray-200"
                    onError={() => setAvatarHasError(true)}
                  />
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-gray-900 leading-snug break-words">{displayName}</p>
                    <p className="text-xs font-semibold" style={{ color: theme.primaryColor }}>
                      {displayRole}
                    </p>
                    <p className="text-sm text-gray-500 break-all">{displayEmail}</p>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <button
                  onClick={handleOpenSettings}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
                >
                  <Settings size={16} />
                  Settings
                </button>

                {!showSignOutConfirm && (
                  <button
                    onClick={() => setShowSignOutConfirm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-100 rounded-lg transition-colors text-red-600"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </button>
                )}

                {showSignOutConfirm && (
                  <div className="space-y-3 px-3 py-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-700">Are you sure you want to sign out?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSignOut}
                        className="flex-1 py-2 rounded-md text-sm font-semibold text-white"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        Yes, Sign Out
                      </button>
                      <button
                        onClick={() => setShowSignOutConfirm(false)}
                        className="flex-1 py-2 rounded-md text-sm font-semibold border border-gray-300 text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
