import React, { useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { Clock, Shield } from 'lucide-react';

const mockUsers = [
  { id: 1, name: 'Sarah Johnson', email: 'sarah@strandshare.com', role: 'H-Staff', status: 'active', joinDate: '2024-01-15' },
  { id: 2, name: 'Michael Chen', email: 'michael@strandshare.com', role: 'Moderator', status: 'active', joinDate: '2024-02-20' },
  { id: 3, name: 'Emily Rodriguez', email: 'emily@strandshare.com', role: 'User', status: 'active', joinDate: '2024-03-10' },
  { id: 4, name: 'James Brown', email: 'james@strandshare.com', role: 'User', status: 'active', joinDate: '2024-03-05' },
  { id: 5, name: 'Lisa Anderson', email: 'lisa@strandshare.com', role: 'Support', status: 'active', joinDate: '2024-01-25' },
];

const mockPending = [
  { id: 101, name: 'David Martinez', email: 'david@example.com', appliedDate: '2024-03-12', requestedRole: 'Moderator' },
  { id: 102, name: 'Jennifer Lee', email: 'jennifer@example.com', appliedDate: '2024-03-10', requestedRole: 'Support' },
  { id: 103, name: 'Robert Taylor', email: 'robert@example.com', appliedDate: '2024-03-08', requestedRole: 'H-Staff' },
];

const mockRoles = [
  { name: 'Super Admin', permissions: 28, users: 5, color: '#ef4444' },
  { name: 'H-Staff', permissions: 22, users: 8, color: '#f97316' },
  { name: 'Moderator', permissions: 15, users: 12, color: '#3b82f6' },
  { name: 'Support', permissions: 10, users: 18, color: '#10b981' },
  { name: 'User', permissions: 5, users: 1247, color: '#6b7280' },
];

export default function UserManagementPage() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">User Management</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage users, roles, and access permissions.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-8">
          {[
            { id: 'active', label: 'Active Users', count: mockUsers.length },
            { id: 'pending', label: 'Pending Requests', count: mockPending.length },
            { id: 'roles', label: 'Roles', count: mockRoles.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-2 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              style={activeTab === tab.id ? { borderBottomColor: theme.primaryColor, color: theme.primaryColor } : {}}
            >
              {tab.label}
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Active Users Tab */}
      {activeTab === 'active' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-900 dark:text-white">
                  Join Date
                </th>
              </tr>
            </thead>
            <tbody>
              {mockUsers.map((user, idx) => (
                <tr
                  key={idx}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="px-3 py-1 rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-green-500">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {user.joinDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Requests Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {mockPending.map((request, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-yellow-200 dark:border-yellow-700/50 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <Clock size={24} style={{ color: theme.primaryColor }} />
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{request.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {request.email} • Requested: {request.requestedRole}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Applied: {request.appliedDate}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className="py-2 px-4 rounded-lg font-medium text-white transition-opacity hover:opacity-80"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  Approve
                </button>
                <button className="py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-2 gap-6">
          {mockRoles.map((role, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                    {role.name}
                  </h3>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Permissions
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {role.permissions}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Total Users
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {role.users}
                      </p>
                    </div>
                  </div>
                </div>
                <Shield
                  size={24}
                  style={{ color: role.color }}
                />
              </div>
              <button
                className="w-full py-2 border rounded-lg font-medium transition-colors"
                style={{
                  borderColor: theme.primaryColor,
                  color: theme.primaryColor,
                }}
              >
                Edit Permissions
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
