import React from 'react';

const mockStats = [
  { label: 'Total Records', value: '24' },
  { label: 'Pending Items', value: '8' },
  { label: 'Completed Today', value: '5' },
];

const mockRows = [
  { name: 'Sample Item A', status: 'In Progress', updated: 'Today' },
  { name: 'Sample Item B', status: 'Queued', updated: 'Yesterday' },
  { name: 'Sample Item C', status: 'Done', updated: '2 days ago' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Partner quick access overview. Keep donation requests, program coordination, and tracking details available at a glance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mockStats.map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Preview Data</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {mockRows.map((row) => (
                <tr key={row.name} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{row.name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.status}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}