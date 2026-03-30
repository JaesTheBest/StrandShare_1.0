import React from 'react';
import { FileSpreadsheet, Download, Filter, CalendarClock } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';

const reports = [
  { id: 'RPT-001', name: 'User Access Summary', range: 'Last 30 days', type: 'CSV' },
  { id: 'RPT-002', name: 'Role Distribution', range: 'Current snapshot', type: 'PDF' },
  { id: 'RPT-003', name: 'Login Activity', range: 'Last 7 days', type: 'CSV' },
];

export default function GenerateReportsPage() {
  const { theme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Generate Reports</h1>
        <p className="text-gray-600">Create and export role, access, and account activity reports.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <button className="rounded-xl border border-gray-200 bg-white p-4 text-left hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <Filter size={18} style={{ color: theme.primaryColor }} />
            <span className="font-semibold text-gray-900">Filter Builder</span>
          </div>
          <p className="text-sm text-gray-600">Select data points and conditions before export.</p>
        </button>

        <button className="rounded-xl border border-gray-200 bg-white p-4 text-left hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <CalendarClock size={18} style={{ color: theme.secondaryColor }} />
            <span className="font-semibold text-gray-900">Scheduled Reports</span>
          </div>
          <p className="text-sm text-gray-600">Automate daily, weekly, or monthly report delivery.</p>
        </button>

        <button className="rounded-xl border border-gray-200 bg-white p-4 text-left hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <FileSpreadsheet size={18} style={{ color: theme.tertiaryColor }} />
            <span className="font-semibold text-gray-900">Templates</span>
          </div>
          <p className="text-sm text-gray-600">Use predefined export templates for consistency.</p>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead style={{ backgroundColor: `${theme.primaryColor}15` }}>
            <tr>
              <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">Report</th>
              <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">Range</th>
              <th className="px-6 py-3 text-left text-sm font-bold text-gray-900">Format</th>
              <th className="px-6 py-3 text-right text-sm font-bold text-gray-900">Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-t border-gray-200">
                <td className="px-6 py-4 text-sm text-gray-800">{report.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{report.range}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{report.type}</td>
                <td className="px-6 py-4 text-right">
                  <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: theme.primaryColor }}>
                    <Download size={14} /> Export
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
