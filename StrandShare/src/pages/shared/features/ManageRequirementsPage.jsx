import React, { useMemo, useState } from 'react';
import { FileText, ListChecks, MapPin } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import WigRequirementsPage from './WigRequirementsPage';
import LogisticsDestinationSettingsPage from './LogisticsDestinationSettingsPage';
import LegalDocumentsPage from './LegalDocumentsPage';

const TABS = [
  {
    id: 'wig-requirements',
    label: 'Wig Requirements',
    description: 'Global hair donation requirements.',
    icon: ListChecks,
  },
  {
    id: 'logistics-destination-settings',
    label: 'Logistics Destination',
    description: 'Shared pickup/drop destination and pinned location.',
    icon: MapPin,
  },
  {
    id: 'legal-documents',
    label: 'Legal Documents',
    description: 'Consent PDF versions and activation.',
    icon: FileText,
  },
];

export default function ManageRequirementsPage({ userProfile }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#0f766e';
  const [activeTab, setActiveTab] = useState('wig-requirements');

  const active = useMemo(
    () => TABS.find((tab) => tab.id === activeTab) || TABS[0],
    [activeTab],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Manage Requirements</h1>
        <p className="mt-1 text-sm text-slate-600">
          All requirement-related pages grouped in one place. Pick a section below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`group relative flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                isActive
                  ? 'border-transparent text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={isActive ? { backgroundColor: primaryColor } : undefined}
            >
              <div
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg transition ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                }`}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-900'}`}>{tab.label}</p>
                <p className={`mt-0.5 text-xs leading-relaxed ${isActive ? 'text-white/90' : 'text-slate-500'}`}>
                  {tab.description}
                </p>
              </div>
              {isActive && (
                <span className="absolute -bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-sm" style={{ backgroundColor: primaryColor }} />
              )}
            </button>
          );
        })}
      </div>

      {active.id === 'wig-requirements' && <WigRequirementsPage userProfile={userProfile} />}
      {active.id === 'logistics-destination-settings' && <LogisticsDestinationSettingsPage userProfile={userProfile} />}
      {active.id === 'legal-documents' && <LegalDocumentsPage userProfile={userProfile} />}
    </div>
  );
}
