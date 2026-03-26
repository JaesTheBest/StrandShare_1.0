import React from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

const performanceData = [
  { time: '00:00', value: 94 },
  { time: '04:00', value: 96 },
  { time: '08:00', value: 97 },
  { time: '12:00', value: 98 },
  { time: '16:00', value: 98.5 },
  { time: '20:00', value: 98.2 },
  { time: '24:00', value: 98.8 },
];

const trafficData = [
  { time: '00:00', value: 8500 },
  { time: '04:00', value: 9200 },
  { time: '08:00', value: 12000 },
  { time: '12:00', value: 14500 },
  { time: '16:00', value: 15200 },
  { time: '20:00', value: 15400 },
  { time: '24:00', value: 13800 },
];

export default function Charts() {
  const { theme } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* System Performance Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            System Performance Index
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">98.2</span>
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              +1.2% IMPROVEMENT
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={performanceData}>
            <defs>
              <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.primaryColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={theme.primaryColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
            <XAxis
              dataKey="time"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={theme.primaryColor}
              fillOpacity={1}
              fill="url(#colorPerf)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Peak User Traffic Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Peak User Traffic
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">15.4k</span>
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              -0.2% PEAK DROP
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trafficData}>
            <defs>
              <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.primaryColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={theme.primaryColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
            <XAxis
              dataKey="time"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={theme.primaryColor}
              fillOpacity={1}
              fill="url(#colorTraffic)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
