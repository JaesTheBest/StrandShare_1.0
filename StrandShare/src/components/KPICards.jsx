import React from 'react';
import { TrendingUp, TrendingDown, Activity, Users, HardDrive, Zap } from 'lucide-react';

const kpiData = [
  {
    title: 'SERVER UPTIME',
    value: '99.9%',
    change: '+0.01%',
    isPositive: true,
    icon: Activity,
  },
  {
    title: 'TOTAL ACTIVE USERS',
    value: '124.5k',
    change: '+12%',
    isPositive: true,
    icon: Users,
  },
  {
    title: 'STORAGE USED',
    value: '45%',
    change: '-5%',
    isPositive: false,
    icon: HardDrive,
  },
  {
    title: 'ACTIVE SESSIONS',
    value: '8,234',
    change: '-3%',
    isPositive: false,
    icon: Zap,
  },
];

export default function KPICards() {
  return (
    <div className="grid grid-cols-4 gap-6">
      {kpiData.map((kpi, index) => {
        const Icon = kpi.icon;
        return (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                  {kpi.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {kpi.value}
                </p>
              </div>
              <Icon size={24} className="text-gray-400 dark:text-gray-600" />
            </div>
            <div className="flex items-center gap-1">
              {kpi.isPositive ? (
                <TrendingUp size={16} className="text-green-500" />
              ) : (
                <TrendingDown size={16} className="text-red-500" />
              )}
              <span
                className="text-sm font-medium"
                style={{ color: kpi.isPositive ? '#10b981' : '#ef4444' }}
              >
                {kpi.change}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
