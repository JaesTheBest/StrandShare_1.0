import React, { useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { Repeat, CheckCircle } from 'lucide-react';

const mockClusters = [
  { name: 'US-EAST-1 Primary', type: 'Primary', status: 'healthy', size: '2.3 TB', connections: 1243, lastBackup: '2 mins ago' },
  { name: 'US-WEST-2 Secondary', type: 'Secondary', status: 'healthy', size: '2.3 TB', connections: 985, lastBackup: '5 mins ago' },
  { name: 'EU-CENTRAL-1', type: 'Secondary', status: 'healthy', size: '2.3 TB', connections: 756, lastBackup: '8 mins ago' },
  { name: 'ASIA-EAST-1', type: 'Cache', status: 'warning', size: '1.8 TB', connections: 452, lastBackup: '12 mins ago' },
];

const mockBackups = [
  { id: 'backup-001', date: '2024-03-15 02:00 UTC', size: '2.3 GB', status: 'completed', duration: '4m 23s', nextSchedule: '2024-03-16 02:00 UTC' },
  { id: 'backup-002', date: '2024-03-14 02:00 UTC', size: '2.2 GB', status: 'completed', duration: '4m 15s', nextSchedule: '— ' },
  { id: 'backup-003', date: '2024-03-13 02:00 UTC', size: '2.1 GB', status: 'completed', duration: '3m 58s', nextSchedule: '— ' },
  { id: 'backup-004', date: '2024-03-12 02:00 UTC', size: '2.0 GB', status: 'completed', duration: '3m 42s', nextSchedule: '— ' },
];

const mockReplication = [
  { name: 'Primary → US-WEST-2', status: 'syncing', lagTime: '0.2s', dataTransferred: '45 MB/s', health: 98 },
  { name: 'Primary → EU-CENTRAL-1', status: 'syncing', lagTime: '1.8s', dataTransferred: '32 MB/s', health: 95 },
  { name: 'Primary → ASIA-EAST-1', status: 'syncing', lagTime: '8.5s', dataTransferred: '18 MB/s', health: 87 },
];

export default function DatabasePage() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('clusters');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Database Management</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitor clusters, backups, and replication status.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-8">
          {[
            { id: 'clusters', label: 'Database Clusters' },
            { id: 'backups', label: 'Backup History' },
            { id: 'replication', label: 'Replication Status' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              style={activeTab === tab.id ? { borderBottomColor: theme.primaryColor, color: theme.primaryColor } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Database Clusters Tab */}
      {activeTab === 'clusters' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Cluster Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Connections
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Last Backup
                </th>
              </tr>
            </thead>
            <tbody>
              {mockClusters.map((cluster, idx) => (
                <tr
                  key={idx}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {cluster.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {cluster.type}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="px-3 py-1 rounded-full text-xs font-bold text-white"
                      style={{
                        backgroundColor:
                          cluster.status === 'healthy' ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {cluster.status.charAt(0).toUpperCase() + cluster.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {cluster.size}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {cluster.connections}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {cluster.lastBackup}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Backup History Tab */}
      {activeTab === 'backups' && (
        <div className="space-y-4">
          {mockBackups.map((backup, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <CheckCircle size={24} className="text-green-500" />
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    {backup.id} • {backup.date}
                  </h3>
                  <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400 mt-2">
                    <span>Size: {backup.size}</span>
                    <span>Duration: {backup.duration}</span>
                    <span>Status: <span className="text-green-600 dark:text-green-400 font-medium">{backup.status}</span></span>
                  </div>
                  {backup.nextSchedule !== '— ' && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Next: {backup.nextSchedule}
                    </p>
                  )}
                </div>
              </div>
              <button
                className="py-2 px-4 border rounded-lg font-medium transition-colors"
                style={{
                  borderColor: theme.primaryColor,
                  color: theme.primaryColor,
                }}
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Replication Status Tab */}
      {activeTab === 'replication' && (
        <div className="space-y-4">
          {mockReplication.map((repl, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                    {repl.name}
                  </h3>
                  <div className="flex gap-8 text-sm text-gray-600 dark:text-gray-400">
                    <span>Lag Time: <span className="font-medium">{repl.lagTime}</span></span>
                    <span>Transfer: <span className="font-medium">{repl.dataTransferred}</span></span>
                  </div>
                </div>
                <Repeat
                  size={24}
                  style={{ color: theme.primaryColor }}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <span>Sync Health</span>
                  <span>{repl.health}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className="h-3 rounded-full"
                    style={{
                      width: `${repl.health}%`,
                      backgroundColor: repl.health > 90 ? '#10b981' : '#f59e0b',
                    }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
