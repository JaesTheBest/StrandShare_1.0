import React, { useState } from 'react';

const tabs = [
  { id: 'new-request', label: 'New Request' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'submitted', label: 'Submitted' },
];

const quickStats = [
  { label: 'New Today', value: '6' },
  { label: 'Pending Review', value: '9' },
  { label: 'Approved', value: '12' },
  { label: 'Urgent Cases', value: '2' },
];

const draftRequests = [
  { id: 'DR-114', patient: 'Marian Ortega', updatedAt: 'Mar 31, 11:10 AM' },
  { id: 'DR-115', patient: 'Jessa Marquez', updatedAt: 'Mar 31, 1:22 PM' },
];

const submittedRequests = [
  { requestId: 'WR-2109', patient: 'Marian Ortega', disease: 'Breast Cancer', urgency: 'High', status: 'Pending Review' },
  { requestId: 'WR-2110', patient: 'Jessa Marquez', disease: 'Alopecia Totalis', urgency: 'Medium', status: 'Approved' },
  { requestId: 'WR-2111', patient: 'Karla Dizon', disease: 'Chemotherapy Hair Loss', urgency: 'High', status: 'For Matching' },
];

const requiredDocs = [
  'Medical abstract with diagnosis',
  'Physician recommendation',
  'Patient consent form',
  'Valid patient ID copy',
];

function tabClass(isActive) {
  return isActive
    ? 'rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white'
    : 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50';
}

function statusClass(status) {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700';
  if (status === 'For Matching') return 'bg-sky-100 text-sky-700';
  return 'bg-amber-100 text-amber-700';
}

function urgencyClass(urgency) {
  if (urgency === 'High') return 'text-rose-600';
  if (urgency === 'Medium') return 'text-amber-600';
  return 'text-slate-600';
}

export default function WigRequestPage() {
  const [activeTab, setActiveTab] = useState('new-request');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Request Wig</h1>
        <p className="text-gray-600">Minimal request workspace for partner hospitals to submit and track patient wig requests.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {quickStats.map((item) => (
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

      {activeTab === 'new-request' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="rounded-xl border border-gray-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900">Patient Request Form</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="Marian Ortega" />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="PT-4431" />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="Breast Cancer" />
              <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="Dr. Miguel Torres" />
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="Shoulder-Length Wavy">
                <option>Shoulder-Length Wavy</option>
                <option>Straight Bob</option>
                <option>Long Layered</option>
                <option>Pixie Cut</option>
              </select>
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="High">
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <textarea
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                rows={3}
                defaultValue="Needs lightweight wig due to scalp sensitivity after treatment."
              />
            </div>

            <button type="button" className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Submit Request
            </button>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-gray-900">Required Documents</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {requiredDocs.map((doc) => (
                <li key={doc} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  {doc}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">Upload complete documents first to avoid review delays.</p>
          </section>
        </div>
      )}

      {activeTab === 'drafts' && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">Saved Draft Requests</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {draftRequests.map((draft) => (
              <article key={draft.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-900">{draft.id}</p>
                <p className="mt-1 text-sm text-gray-700">Patient: {draft.patient}</p>
                <p className="text-xs text-gray-500">Last updated: {draft.updatedAt}</p>
                <button type="button" className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                  Continue Draft
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'submitted' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Submitted Requests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Disease</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Urgency</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {submittedRequests.map((row) => (
                  <tr key={row.requestId} className="border-t border-gray-200">
                    <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                    <td className="px-4 py-3 text-gray-700">{row.patient}</td>
                    <td className="px-4 py-3 text-gray-700">{row.disease}</td>
                    <td className={`px-4 py-3 text-sm font-semibold ${urgencyClass(row.urgency)}`}>{row.urgency}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
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
    </div>
  );
}
