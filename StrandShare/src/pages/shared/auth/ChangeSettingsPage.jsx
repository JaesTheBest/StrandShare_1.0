import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';

const CHANGE_SETTINGS_STORAGE_KEY = 'strandshare_change_settings';

export default function ChangeSettingsPage() {
  const { theme } = useTheme();
  const [settings, setSettings] = useState({
    rememberEmail: true,
    showPasswordHints: true,
    compactLoginMode: false,
  });
  const [toast, setToast] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHANGE_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSettings((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(CHANGE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      setToast('Change settings saved.');
      setTimeout(() => setToast(''), 1800);
    } catch {
      setToast('Failed to save settings.');
      setTimeout(() => setToast(''), 1800);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Change Settings</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Simple login experience preferences. Styled by current branding theme.
        </p>

        <div className="mt-6 space-y-4">
          {[
            {
              key: 'rememberEmail',
              label: 'Remember email on next login',
            },
            {
              key: 'showPasswordHints',
              label: 'Show password hints while typing',
            },
            {
              key: 'compactLoginMode',
              label: 'Use compact login form layout',
            },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
            >
              <span className="text-sm text-gray-700 dark:text-gray-200">{item.label}</span>
              <input
                type="checkbox"
                checked={settings[item.key]}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    [item.key]: event.target.checked,
                  }))
                }
                style={{ accentColor: theme.primaryColor }}
              />
            </label>
          ))}
        </div>

        {toast && (
          <div className="mt-4 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
            {toast}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ backgroundColor: theme.primaryColor }}
          >
            <Save size={16} />
            Save
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
