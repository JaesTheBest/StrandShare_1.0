import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { CheckCircle, AlertCircle } from 'lucide-react';

const healthItems = [
  {
    icon: 'check',
    name: 'US-EAST NODE CLUSTER',
    description: 'Sync completed in 1.2s',
    time: '12:45 PM',
  },
  {
    icon: 'warning',
    name: 'EU-WEST REPLICATION',
    description: 'Minor latency spike detected (400ms)',
    time: '12:20 PM',
    hasWarning: true,
  },
  {
    icon: 'check',
    name: 'AU-CENTRAL DATABASE',
    description: 'Backups verified',
    time: '11:15 AM',
  },
];

export default function DatabaseHealth() {
  const { theme } = useTheme();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Database Health (Last 12 Instances)
        </h3>
        <button
          type="button"
          className="text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: theme.primaryColor }}
        >
          Full Log
        </button>
      </div>

      <div className="space-y-4">
        {healthItems.map((item, index) => (
          <div
            key={index}
            className={`flex items-center gap-4 p-4 rounded-lg border ${
              item.hasWarning
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700/50'
                : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
            }`}
          >
            <div>
              {item.icon === 'check' ? (
                <CheckCircle size={24} className="text-green-500" />
              ) : (
                <AlertCircle size={24} className="text-orange-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {item.name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {item.description}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {item.time}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
