import React from 'react';
import {
  LayoutDashboard,
  Users,
  CheckCircle,
  Package,
  Calendar,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import ViewDonorInformationsPage from './ViewDonorInformationsPage';
import UpdateDonationStatusPage from './UpdateDonationStatusPage';
import UpdateWigRequestStatusPage from './UpdateWigRequestStatusPage';
import ScheduleAppointmentsPage from './ScheduleAppointmentsPage';
import SettingsPage from './SettingsPage';
import ManageDonationRequirementsPage from './ManageDonationRequirementsPage';

const staffNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'view-donor-informations', label: 'View Donor Informations', icon: Users },
  { id: 'update-donation-status', label: 'Update Donation Status', icon: CheckCircle },
  { id: 'update-wig-request-status', label: 'Update Wig Request Status', icon: Package },
  { id: 'schedule-appointments', label: 'Schedule Appointments', icon: Calendar },
  { id: 'manage-donation-requirements', label: 'Manage Donation Requirements', icon: CheckCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const staffPageComponents = {
  dashboard: DashboardPage,
  'view-donor-informations': ViewDonorInformationsPage,
  'update-donation-status': UpdateDonationStatusPage,
  'update-wig-request-status': UpdateWigRequestStatusPage,
  'schedule-appointments': ScheduleAppointmentsPage,
  'manage-donation-requirements': ManageDonationRequirementsPage,
  settings: SettingsPage,
};

export default function StaffRole({ onSignOut, userProfile }) {
  return (
    <RoleDashboardShell
      onSignOut={onSignOut}
      userProfile={userProfile}
      navItems={staffNavItems}
      pageComponents={staffPageComponents}
      defaultPage="dashboard"
    />
  );
}
