import React from 'react';
import { RotateCcw, Shield, Upload, KeySquare } from 'lucide-react';

const actions = [
  { icon: RotateCcw, label: 'FLUSH CACHE' },
  { icon: Shield, label: 'SECURITY SCAN' },
  { icon: Upload, label: 'PUSH PATCH' },
  { icon: KeySquare, label: 'AUDIT ROLES' },
];

export default function QuickActions() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
        Quick Actions
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={index}
              className="flex flex-col items-center justify-center gap-3 p-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
            >
              <Icon size={24} className="text-gray-600 dark:text-gray-400 group-hover:opacity-80" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 text-center">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
