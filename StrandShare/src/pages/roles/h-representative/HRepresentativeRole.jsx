import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Package,
  FileBarChart,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import ManagePatientsPage from './ManagePatientsPage';
import WigRequestPage from './WigRequestPage';
import ReleaseDateApprovalPage from './ReleaseDateApprovalPage';
import GenerateReportsPage from './GenerateReportsPage';
import SettingsPage from './SettingsPage';

const hRepresentativeNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'manage-patients', label: 'Manage Patients', icon: Users },
  { id: 'wig-request', label: 'Request Wig', icon: Package },
  { id: 'fitting-release', label: 'Release Date Approval', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const hRepresentativePageComponents = {
  dashboard: DashboardPage,
  'manage-patients': ManagePatientsPage,
  'wig-request': WigRequestPage,
  'fitting-release': ReleaseDateApprovalPage,
  reports: GenerateReportsPage,
  settings: SettingsPage,
};

export default function HRepresentativeRole({ onSignOut, userProfile }) {
  return (
    <RoleDashboardShell
      onSignOut={onSignOut}
      userProfile={userProfile}
      navItems={hRepresentativeNavItems}
      pageComponents={hRepresentativePageComponents}
      defaultPage="dashboard"
    />
  );
}
