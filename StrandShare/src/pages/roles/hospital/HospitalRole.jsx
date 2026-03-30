import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Package,
  CheckCircle,
  FileBarChart,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import WigRequestPage from './WigRequestPage';
import TrackRequestedWigPage from './TrackRequestedWigPage';
import FittingReleaseSchedulingPage from './FittingReleaseSchedulingPage';
import GenerateReportsPage from './GenerateReportsPage';
import SettingsPage from './SettingsPage';

const hospitalNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'wig-request', label: 'Request Wig', icon: Package },
  { id: 'track-requested-wig', label: 'Track Status', icon: CheckCircle },
  { id: 'fitting-release', label: 'Fitting & Release', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const hospitalPageComponents = {
  dashboard: DashboardPage,
  'wig-request': WigRequestPage,
  'track-requested-wig': TrackRequestedWigPage,
  'fitting-release': FittingReleaseSchedulingPage,
  reports: GenerateReportsPage,
  settings: SettingsPage,
};

export default function HospitalRole({ onSignOut, userProfile }) {
  return (
    <RoleDashboardShell
      onSignOut={onSignOut}
      userProfile={userProfile}
      navItems={hospitalNavItems}
      pageComponents={hospitalPageComponents}
      defaultPage="dashboard"
    />
  );
}
