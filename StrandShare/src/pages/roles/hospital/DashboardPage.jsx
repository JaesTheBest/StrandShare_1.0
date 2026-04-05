import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const kpiCards = [
  { label: 'Total Requests', value: '74' },
  { label: 'Pending Review', value: '9' },
  { label: 'For Matching', value: '13' },
  { label: 'In Production', value: '9' },
  { label: 'To Be Release', value: '7' },
  { label: 'Released', value: '45' },
];

const weeklyFlowData = [
  { week: 'W1', requested: 14, released: 8 },
  { week: 'W2', requested: 18, released: 11 },
  { week: 'W3', requested: 21, released: 12 },
  { week: 'W4', requested: 21, released: 14 },
];

const stageBreakdownData = [
  { name: 'Pending Review', value: 9 },
  { name: 'For Matching', value: 13 },
  { name: 'In Production', value: 9 },
  { name: 'To Be Release', value: 7 },
  { name: 'In Transit', value: 3 },
  { name: 'Released', value: 45 },
];

const moduleSnapshotData = [
  { module: 'Request Wig', count: 6 },
  { module: 'Track Status', count: 13 },
  { module: 'Release Date Approval', count: 14 },
  { module: 'Reports', count: 5 },
];

const activeRequests = [
  { requestId: 'WR-2104', patient: 'Anne Delos Reyes', stage: 'For Matching', nextStep: 'Donor compatibility check', eta: 'Apr 02' },
  { requestId: 'WR-2106', patient: 'Lena Cruz', stage: 'In Production', nextStep: 'Hair ventilating in progress', eta: 'Apr 04' },
  { requestId: 'WR-2108', patient: 'Mika Santos', stage: 'To Be Release', nextStep: 'Confirm release date', eta: 'Apr 01' },
];

const actionQueue = [
  { requestId: 'WR-2109', task: 'Attach missing physician signature', priority: 'High', due: 'Today 5:00 PM' },
  { requestId: 'WR-2111', task: 'Confirm fitting attendance', priority: 'Medium', due: 'Apr 01 10:00 AM' },
  { requestId: 'WR-2098', task: 'Review comfort feedback form', priority: 'Medium', due: 'Apr 02 2:00 PM' },
];

const recentUpdates = [
  { time: '08:20 AM', update: 'WR-2106 moved to In Production', source: 'Track Status' },
  { time: '10:05 AM', update: 'WR-2108 moved to To Be Release', source: 'Release Date Approval' },
  { time: '01:40 PM', update: 'WR-2110 release confirmed by patient', source: 'Track Status' },
  { time: '03:10 PM', update: 'Daily partner report generated', source: 'Reports' },
];

function hexToRgba(hexValue, alpha = 1) {
  const safeHex = String(hexValue || '').trim();
  const hexMatch = safeHex.match(/^#([0-9a-f]{6})$/i);
  if (!hexMatch) {
    return `rgba(15, 23, 42, ${alpha})`;
  }

  const raw = hexMatch[1];
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function stageClass(stage) {
  if (stage === 'Released') return 'bg-emerald-100 text-emerald-700';
  if (stage === 'To Be Release') return 'bg-sky-100 text-sky-700';
  if (stage === 'In Production') return 'bg-indigo-100 text-indigo-700';
  return 'bg-amber-100 text-amber-700';
}

function priorityClass(priority) {
  if (priority === 'High') return 'text-rose-600';
  if (priority === 'Medium') return 'text-amber-600';
  return 'text-slate-600';
}

export default function DashboardPage() {
  const { theme } = useTheme();

  const panelBorder = hexToRgba(theme.secondaryColor, 0.26);
  const softPanelBg = hexToRgba(theme.primaryColor, 0.05);
  const stageColors = [
    hexToRgba(theme.primaryColor, 0.65),
    hexToRgba(theme.primaryColor, 0.82),
    hexToRgba(theme.secondaryColor, 0.78),
    hexToRgba(theme.tertiaryColor, 0.8),
    hexToRgba(theme.secondaryColor, 0.52),
    hexToRgba(theme.tertiaryColor, 0.95),
  ];

  return (
    <div className="h-full overflow-hidden p-4 md:p-5" style={{ backgroundColor: theme.backgroundColor }}>
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_1fr_1fr] gap-3">
        <header className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: panelBorder, backgroundColor: softPanelBg }}>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: theme.primaryTextColor }}>H-Staff Command Overview</h1>
            <p className="text-xs" style={{ color: theme.secondaryTextColor }}>
              One-look summary of request, tracking, release date approvals, and reports.
            </p>
          </div>
          <div className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: hexToRgba(theme.primaryColor, 0.15), color: theme.primaryColor }}>
            Live Partner Snapshot
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((card) => (
            <article key={card.label} className="rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: panelBorder }}>
              <p className="text-[11px] leading-tight" style={{ color: theme.secondaryTextColor }}>{card.label}</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: theme.primaryTextColor }}>{card.value}</p>
            </article>
          ))}
        </section>

        <section className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="min-h-0 rounded-xl border bg-white p-3 xl:col-span-5" style={{ borderColor: panelBorder }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primaryTextColor }}>Request vs Release Trend</h2>
            <div className="mt-2 h-[calc(100%-1.75rem)] min-h-0 w-full">
              <ResponsiveContainer>
                <LineChart data={weeklyFlowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={hexToRgba(theme.secondaryColor, 0.24)} />
                  <XAxis dataKey="week" stroke={theme.secondaryTextColor} fontSize={11} />
                  <YAxis stroke={theme.secondaryTextColor} fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requested" name="Requested" stroke={theme.primaryColor} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="released" name="Released" stroke={theme.tertiaryColor} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="min-h-0 rounded-xl border bg-white p-3 xl:col-span-3" style={{ borderColor: panelBorder }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primaryTextColor }}>Stage Distribution</h2>
            <div className="mt-1 h-[58%] min-h-[96px] w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={stageBreakdownData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={28}
                    outerRadius={46}
                    paddingAngle={2}
                  >
                    {stageBreakdownData.map((entry, index) => (
                      <Cell key={entry.name} fill={stageColors[index % stageColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-1 space-y-1 text-[11px]">
              {stageBreakdownData.slice(0, 4).map((item, index) => (
                <li key={item.name} className="flex items-center justify-between" style={{ color: theme.secondaryTextColor }}>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stageColors[index % stageColors.length] }} />
                    {item.name}
                  </span>
                  <span className="font-semibold" style={{ color: theme.primaryTextColor }}>{item.value}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="min-h-0 rounded-xl border bg-white p-3 xl:col-span-4" style={{ borderColor: panelBorder }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primaryTextColor }}>Page Activity Snapshot</h2>
            <div className="mt-2 h-[calc(100%-1.75rem)] min-h-0 w-full">
              <ResponsiveContainer>
                <BarChart data={moduleSnapshotData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={hexToRgba(theme.secondaryColor, 0.24)} />
                  <XAxis dataKey="module" stroke={theme.secondaryTextColor} fontSize={11} />
                  <YAxis stroke={theme.secondaryTextColor} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="count" fill={theme.primaryColor} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="min-h-0 rounded-xl border bg-white p-3 xl:col-span-4" style={{ borderColor: panelBorder }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primaryTextColor }}>Needs Action</h2>
            <ul className="mt-2 space-y-2">
              {actionQueue.map((item) => (
                <li key={item.requestId} className="rounded-lg border px-2.5 py-2" style={{ borderColor: hexToRgba(theme.secondaryColor, 0.2), backgroundColor: hexToRgba(theme.secondaryColor, 0.06) }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold" style={{ color: theme.primaryTextColor }}>{item.requestId}</p>
                    <span className={`text-[11px] font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
                  </div>
                  <p className="mt-0.5 text-[11px]" style={{ color: theme.secondaryTextColor }}>{item.task}</p>
                  <p className="text-[11px]" style={{ color: theme.tertiaryTextColor }}>Due: {item.due}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="min-h-0 rounded-xl border bg-white p-3 xl:col-span-5" style={{ borderColor: panelBorder }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primaryTextColor }}>Active Requests</h2>
            <ul className="mt-2 space-y-2">
              {activeRequests.map((item) => (
                <li key={item.requestId} className="rounded-lg border px-2.5 py-2" style={{ borderColor: hexToRgba(theme.primaryColor, 0.25), backgroundColor: hexToRgba(theme.primaryColor, 0.05) }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold" style={{ color: theme.primaryTextColor }}>{item.requestId} - {item.patient}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stageClass(item.stage)}`}>{item.stage}</span>
                  </div>
                  <p className="mt-0.5 text-[11px]" style={{ color: theme.secondaryTextColor }}>{item.nextStep}</p>
                  <p className="text-[11px]" style={{ color: theme.tertiaryTextColor }}>ETA: {item.eta}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="min-h-0 rounded-xl border bg-white p-3 xl:col-span-3" style={{ borderColor: panelBorder }}>
            <h2 className="text-sm font-semibold" style={{ color: theme.primaryTextColor }}>Recent Updates</h2>
            <ul className="mt-2 space-y-2">
              {recentUpdates.slice(0, 3).map((item) => (
                <li key={`${item.time}-${item.update}`} className="rounded-lg border px-2.5 py-2" style={{ borderColor: hexToRgba(theme.tertiaryColor, 0.3), backgroundColor: hexToRgba(theme.tertiaryColor, 0.07) }}>
                  <p className="text-[10px] font-semibold uppercase" style={{ color: theme.secondaryTextColor }}>{item.time}</p>
                  <p className="mt-0.5 text-[11px] font-semibold" style={{ color: theme.primaryTextColor }}>{item.update}</p>
                  <p className="text-[11px]" style={{ color: theme.tertiaryTextColor }}>{item.source}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </div>
  );
}