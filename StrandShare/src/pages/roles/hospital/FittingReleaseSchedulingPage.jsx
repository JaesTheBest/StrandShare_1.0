import React, { useState } from 'react';

const tabs = [
  { id: 'fitting', label: 'Fitting' },
  { id: 'release', label: 'Release' },
  { id: 'follow-up', label: 'Post-Release' },
];

const summaryCards = [
  { label: 'Fittings This Week', value: '14' },
  { label: 'Ready For Release', value: '8' },
  { label: 'Follow-ups Due', value: '11' },
  { label: 'Adjustments Needed', value: '3' },
];

const fittingSchedule = [
  { requestId: 'WR-2098', patient: 'Mika Santos', date: 'Apr 01, 2026', slot: '10:30 AM', status: 'Confirmed' },
  { requestId: 'WR-2104', patient: 'Anne Delos Reyes', date: 'Apr 02, 2026', slot: '01:00 PM', status: 'Pending' },
  { requestId: 'WR-2107', patient: 'Rica Mendoza', date: 'Apr 03, 2026', slot: '09:15 AM', status: 'Rescheduled' },
];

const releaseSchedule = [
  { requestId: 'WR-2089', patient: 'Ana Prieto', date: 'Apr 01, 2026', method: 'Hospital Pickup', status: 'Ready' },
  { requestId: 'WR-2090', patient: 'Leah Morales', date: 'Apr 02, 2026', method: 'Courier Delivery', status: 'In Transit' },
  { requestId: 'WR-2091', patient: 'Rina Cabrera', date: 'Apr 03, 2026', method: 'Hospital Pickup', status: 'Ready' },
];

const postReleaseFollowUp = [
  { requestId: 'WR-2078', patient: 'Jenica Alvarez', nextCheck: 'Apr 05, 2026', comfortScore: '4/5', action: 'Schedule adjustment' },
  { requestId: 'WR-2079', patient: 'Celine Ortega', nextCheck: 'Apr 08, 2026', comfortScore: '5/5', action: 'Routine follow-up' },
  { requestId: 'WR-2081', patient: 'Monique Flores', nextCheck: 'Apr 10, 2026', comfortScore: '3/5', action: 'Clinical review' },
];

function tabClass(isActive) {
  return isActive
    ? 'rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white'
    : 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50';
}

function fittingStatusClass(status) {
  if (status === 'Confirmed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Pending') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

function releaseStatusClass(status) {
  if (status === 'Ready') return 'bg-emerald-100 text-emerald-700';
  if (status === 'In Transit') return 'bg-sky-100 text-sky-700';
  return 'bg-slate-100 text-slate-700';
}

export default function FittingReleaseSchedulingPage() {
  const [activeTab, setActiveTab] = useState('fitting');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Fitting & Release</h1>
        <p className="text-gray-600">Coordinate patient fitting schedules, release handoff, and post-release care checks in one place.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map((item) => (
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

      {activeTab === 'fitting' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Fitting Schedule</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Slot</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {fittingSchedule.map((row) => (
                  <tr key={row.requestId} className="border-t border-gray-200">
                    <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                    <td className="px-4 py-3 text-gray-700">{row.patient}</td>
                    <td className="px-4 py-3 text-gray-700">{row.date}</td>
                    <td className="px-4 py-3 text-gray-700">{row.slot}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fittingStatusClass(row.status)}`}>
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

      {activeTab === 'release' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Release Schedule</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Method</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {releaseSchedule.map((row) => (
                  <tr key={row.requestId} className="border-t border-gray-200">
                    <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                    <td className="px-4 py-3 text-gray-700">{row.patient}</td>
                    <td className="px-4 py-3 text-gray-700">{row.date}</td>
                    <td className="px-4 py-3 text-gray-700">{row.method}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${releaseStatusClass(row.status)}`}>
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

      {activeTab === 'follow-up' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Post-Release Follow-up</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Next Check</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Comfort Score</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {postReleaseFollowUp.map((row) => (
                  <tr key={row.requestId} className="border-t border-gray-200">
                    <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                    <td className="px-4 py-3 text-gray-700">{row.patient}</td>
                    <td className="px-4 py-3 text-gray-700">{row.nextCheck}</td>
                    <td className="px-4 py-3 text-gray-700">{row.comfortScore}</td>
                    <td className="px-4 py-3 text-gray-700">{row.action}</td>
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
