import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { BarChart3, Users, Database, Activity } from 'lucide-react';

export default function ThemePreview() {
  const { theme } = useTheme();

  return (
    <div className="sticky top-0 h-screen bg-gray-900 rounded-lg overflow-hidden shadow-2xl border border-gray-700 flex flex-col">
      {/* Preview Header */}
      <div
        className="px-4 py-3 border-b border-gray-700 flex items-center justify-between"
        style={{ backgroundColor: theme.primaryColor }}
      >
        <h3 className="text-white font-bold text-sm">Live Preview</h3>
        <div className="text-xs px-2 py-1 bg-white/20 rounded text-white">
          {theme.sidebarPosition === 'left' ? 'Left Sidebar' : 'Right Sidebar'} • {theme.navbarPosition === 'top' ? 'Top Nav' : 'Bottom Nav'}
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-hidden bg-gray-950 p-3">
        <div className="h-full bg-gray-800 rounded relative flex flex-col">
          {/* Top Bar */}
          <div className="flex items-center gap-2 p-2 bg-gray-700/50 border-b border-gray-600">
            <div className="w-6 h-6 rounded bg-gray-600"></div>
            <div className="flex-1 h-4 bg-gray-600 rounded w-24"></div>
            <div className="flex gap-1">
              <div className="w-4 h-4 bg-gray-600 rounded"></div>
              <div className="w-4 h-4 bg-gray-600 rounded"></div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <div className="w-12 bg-gray-700/50 border-r border-gray-600 p-2 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-8 bg-gray-600 rounded"
                  style={i === 1 ? { backgroundColor: theme.primaryColor, opacity: 0.8 } : {}}
                ></div>
              ))}
            </div>

            {/* Cards Grid */}
            <div className="flex-1 p-2 overflow-hidden">
              <div className="grid grid-cols-2 gap-2 h-full">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="bg-gray-700 rounded border-l-4 flex flex-col justify-between p-2"
                    style={{ borderColor: i === 1 ? theme.primaryColor : i === 2 ? theme.secondaryColor : theme.tertiaryColor }}
                  >
                    <div className="text-xs text-gray-300 font-medium">Metric {i}</div>
                    <div className="h-6 bg-gray-600 rounded w-1/2"></div>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((j) => (
                        <div key={j} className="h-1 flex-1 bg-gray-600 rounded"></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview Actions */}
          <div className="p-2 border-t border-gray-600 flex gap-2">
            <button
              className="flex-1 h-6 rounded text-xs font-medium text-white"
              style={{ backgroundColor: theme.primaryColor, opacity: 0.9 }}
            >
              Primary
            </button>
            <button
              className="flex-1 h-6 rounded text-xs font-medium text-gray-900"
              style={{ backgroundColor: theme.secondaryColor, opacity: 0.9 }}
            >
              Secondary
            </button>
            <button
              className="flex-1 h-6 rounded text-xs font-medium text-white"
              style={{ backgroundColor: theme.tertiaryColor, opacity: 0.9 }}
            >
              Tertiary
            </button>
          </div>
        </div>
      </div>

      {/* Theme Info Footer */}
      <div className="px-3 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400 space-y-1">
        <div className="flex items-center justify-between">
          <span>Font:</span>
          <span className="text-gray-300 font-mono">{theme.selectedFont}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Colors:</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: theme.primaryColor }}></div>
            <div className="w-3 h-3 rounded" style={{ backgroundColor: theme.secondaryColor }}></div>
            <div className="w-3 h-3 rounded" style={{ backgroundColor: theme.tertiaryColor }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
