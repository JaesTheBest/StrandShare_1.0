import React from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  Database,
  FileText,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';

const cards = [
  { label: 'Total Accounts', value: '1,284', trend: '+4.2%', icon: Users },
  { label: 'Reports Generated', value: '86', trend: '+10.4%', icon: FileText },
  { label: 'Audit Events Today', value: '243', trend: '+1.8%', icon: ShieldCheck },
  { label: 'Backups Completed', value: '30', trend: '+0.7%', icon: BarChart3 },
];

const mockGovernancePipeline = [
  { name: 'Role Drift Detection', progress: 82, status: 'Healthy' },
  { name: 'Access Window Compliance', progress: 67, status: 'Review' },
  { name: 'MFA Coverage Expansion', progress: 74, status: 'Healthy' },
  { name: 'Retention Policy Validation', progress: 58, status: 'Attention' },
];

const mockActivityTimeline = [
  { time: '08:00', label: 'Scheduled backup validation', state: 'done' },
  { time: '10:15', label: 'Cross-region sync health check', state: 'done' },
  { time: '13:20', label: 'Privilege escalation review', state: 'pending' },
  { time: '16:40', label: 'Export compliance audit report', state: 'pending' },
];

const mockForecast = [35, 42, 48, 55, 57, 63, 68, 72, 77, 81, 86, 90];

const mockQueues = [
  { queue: 'User Access Reconcile', waiting: 18, eta: '12m' },
  { queue: 'Report Generation Batch', waiting: 9, eta: '5m' },
  { queue: 'Policy Drift Alerts', waiting: 4, eta: '2m' },
  { queue: 'Backup Integrity Scan', waiting: 6, eta: '8m' },
];

export default function SuperAdminOverviewPage() {
  const { theme } = useTheme();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Super Admin Overview</h2>
        <p className="text-gray-600 mt-1">Centralized control for accounts, reports, logs, and data protection.</p>
        <div className="mt-3 inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs font-semibold text-gray-500">
          Placeholder Visualization Mode
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl bg-white border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">{card.label}</p>
                <Icon size={18} style={{ color: theme.primaryColor }} />
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="mt-2 text-sm font-semibold text-emerald-600 inline-flex items-center gap-1">
                {card.trend}
                <ArrowUpRight size={14} />
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Workflow size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">Governance Automation Pipeline</h3>
          </div>
          <div className="space-y-4">
            {mockGovernancePipeline.map((item) => (
              <div key={item.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{item.name}</span>
                  <span className="text-gray-500">{item.progress}% • {item.status}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${item.progress}%`, backgroundColor: theme.primaryColor }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock3 size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">Ops Timeline</h3>
          </div>
          <div className="space-y-3">
            {mockActivityTimeline.map((event) => (
              <div key={event.time + event.label} className="flex items-start gap-3">
                <div
                  className="w-2.5 h-2.5 mt-1.5 rounded-full"
                  style={{ backgroundColor: event.state === 'done' ? '#10b981' : '#f59e0b' }}
                />
                <div>
                  <p className="text-xs text-gray-500">{event.time}</p>
                  <p className="text-sm text-gray-800">{event.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">90-Day H-Staff Capacity Forecast</h3>
          </div>
          <div className="h-40 flex items-end gap-2">
            {mockForecast.map((value, index) => (
              <div key={`forecast-${index}`} className="flex-1">
                <div
                  className="rounded-t-md"
                  style={{
                    height: `${value}%`,
                    background: `linear-gradient(180deg, ${theme.primaryColor} 0%, ${theme.primaryColor}88 100%)`,
                  }}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Mock trend for future predictive analytics integration.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">Processing Queues</h3>
          </div>
          <div className="space-y-3">
            {mockQueues.map((item) => (
              <div key={item.queue} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-800">{item.queue}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Waiting: {item.waiting} • ETA: {item.eta}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
