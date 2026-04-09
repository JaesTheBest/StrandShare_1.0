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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Organization quick access overview. Keep donation requests, program coordination, and tracking details available at a glance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mockStats.map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Preview Data</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {mockRows.map((row) => (
                <tr key={row.name} className="border-t border-gray-200">
                  <td className="px-4 py-3 text-gray-800">{row.name}</td>
                  <td className="px-4 py-3 text-gray-700">{row.status}</td>
                  <td className="px-4 py-3 text-gray-600">{row.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}