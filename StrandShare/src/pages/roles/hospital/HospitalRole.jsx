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
import FittingReleaseSchedulingPage from './FittingReleaseSchedulingPage';
import GenerateReportsPage from './GenerateReportsPage';
import SettingsPage from './SettingsPage';

const hospitalNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'manage-patients', label: 'Manage Patients', icon: Users },
  { id: 'wig-request', label: 'Request Wig', icon: Package },
  { id: 'fitting-release', label: 'Release Date Approval', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const hospitalPageComponents = {
  dashboard: DashboardPage,
  'manage-patients': ManagePatientsPage,
  'wig-request': WigRequestPage,
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
