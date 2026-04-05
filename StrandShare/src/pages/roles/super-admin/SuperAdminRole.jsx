import React from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  ClipboardList,
  HardDrive,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import ManageUserAccountsPage from './ManageUserAccountsPage';
import ManageHospitalAccountsPage from './ManageHospitalAccountsPage';
import GenerateReportsPage from './GenerateReportsPage';
import AuditTrailsPage from './AuditTrailsPage';
import BackupPage from './BackupPage';
import SettingsPage from './SettingsPage';

const superAdminNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'manage-user-accounts', label: 'Manage User Accounts', icon: Users },
  { id: 'manage-hospital-accounts', label: 'Manage Hospital Accounts', icon: Building2 },
  { id: 'generate-reports', label: 'Generate Reports', icon: FileText },
  { id: 'audit-trails', label: 'Audit Trails', icon: ClipboardList },
  { id: 'backup', label: 'Backup', icon: HardDrive },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const superAdminPageComponents = {
  dashboard: DashboardPage,
  'manage-user-accounts': ManageUserAccountsPage,
  'manage-hospital-accounts': ManageHospitalAccountsPage,
  'generate-reports': GenerateReportsPage,
  'audit-trails': AuditTrailsPage,
  backup: BackupPage,
  settings: SettingsPage,
};

export default function SuperAdminRole({ onSignOut, userProfile }) {
  return (
    <RoleDashboardShell
      onSignOut={onSignOut}
      userProfile={userProfile}
      navItems={superAdminNavItems}
      pageComponents={superAdminPageComponents}
      defaultPage="dashboard"
    />
  );
}
