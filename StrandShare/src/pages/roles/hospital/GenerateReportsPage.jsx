import React, { useState } from 'react';

const tabs = [
  { id: 'quick', label: 'Quick Generate' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'history', label: 'History' },
];

const reportSummary = [
  { label: 'Generated This Month', value: '18' },
  { label: 'Scheduled Reports', value: '4' },
  { label: 'Pending Review', value: '2' },
  { label: 'Exports', value: '11' },
];

const reportTemplates = [
  { name: 'Request Intake Summary', period: 'Daily', format: 'PDF + CSV' },
  { name: 'Patient Status Distribution', period: 'Weekly', format: 'XLSX' },
  { name: 'Turnaround Time Report', period: 'Monthly', format: 'PDF' },
];

const scheduledReports = [
  { title: 'Weekly Request Snapshot', runOn: 'Every Monday 07:00 AM', recipients: 'hstaff@strandshare.org', status: 'Active' },
  { title: 'Daily Status Digest', runOn: 'Daily 06:00 PM', recipients: 'operations@strandshare.org', status: 'Active' },
  { title: 'Monthly SLA Report', runOn: 'Every 1st day 08:00 AM', recipients: 'admin@strandshare.org', status: 'Paused' },
];

const generatedHistory = [
  { file: 'Request_Intake_Mar31_2026.pdf', generatedBy: 'H-Staff Partner', generatedAt: 'Mar 31, 2026 09:45 AM' },
  { file: 'Patient_Status_W13.xlsx', generatedBy: 'Nurse R. Tan', generatedAt: 'Mar 30, 2026 07:12 PM' },
  { file: 'Turnaround_Mar2026.pdf', generatedBy: 'Leah Tomas', generatedAt: 'Mar 30, 2026 02:06 PM' },
];

function tabClass(isActive) {
  return isActive
    ? 'rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white'
    : 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50';
}

function scheduleStatusClass(status) {
  if (status === 'Active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Paused') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function GenerateReportsPage() {
  const [activeTab, setActiveTab] = useState('quick');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600">Generate and review partner-level reports for wig request monitoring and delivery outcomes.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {reportSummary.map((item) => (
          <article key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{item.value}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={tabClass(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'quick' && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">Quick Report Templates</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {reportTemplates.map((template) => (
              <article key={template.name} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-800">{template.name}</p>
                <p className="mt-1 text-xs text-gray-500">Period: {template.period}</p>
                <p className="text-xs text-gray-500">Format: {template.format}</p>
                <button type="button" className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                  Generate
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'scheduled' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Scheduled Reports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Schedule</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Recipients</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduledReports.map((row) => (
                  <tr key={row.title} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-gray-800">{row.title}</td>
                    <td className="px-4 py-3 text-gray-700">{row.runOn}</td>
                    <td className="px-4 py-3 text-gray-700">{row.recipients}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${scheduleStatusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Generated Files</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">File</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Generated By</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Generated At</th>
                </tr>
              </thead>
              <tbody>
                {generatedHistory.map((row) => (
                  <tr key={row.file} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-gray-800">{row.file}</td>
                    <td className="px-4 py-3 text-gray-700">{row.generatedBy}</td>
                    <td className="px-4 py-3 text-gray-700">{row.generatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}