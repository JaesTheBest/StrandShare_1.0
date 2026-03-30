import React from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Users,
  Database,
  Shield,
  Settings,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'user-management', label: 'User Management', icon: Users },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ currentPage, onNavigate, items = navItems }) {
  const { theme } = useTheme();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          {theme.logoImage ? (
            <img
              src={theme.logoImage}
              alt="Brand logo"
              className="w-10 h-10 rounded-lg object-cover border border-gray-200"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: theme.primaryColor }}
            >
              A
            </div>
          )}
          <div>
            <h2 className="font-bold text-gray-900">{theme.brandName}</h2>
            <p className="text-xs text-gray-500">{theme.brandTagline}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon
                size={20}
                style={isActive ? { color: theme.primaryColor } : {}}
              />
              <span
                className={`text-sm font-medium ${
                  isActive ? 'text-gray-600' : 'text-gray-600'
                }`}
                style={isActive ? { color: theme.primaryColor } : {}}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

    </div>
  );
}
