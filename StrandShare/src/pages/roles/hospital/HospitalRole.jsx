import React from 'react';
import {
  LayoutDashboard,
  Heart,
  Calendar,
  Package,
  CheckCircle,
  FileBarChart,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import ManageHairDonationsPage from './ManageHairDonationsPage';
import ManageAppointmentsPage from './ManageAppointmentsPage';
import ManageWigInventoryPage from './ManageWigInventoryPage';
import TrackDonationStatusPage from './TrackDonationStatusPage';
import GenerateReportsPage from './GenerateReportsPage';
import SettingsPage from './SettingsPage';

const hospitalNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'manage-hair-donations', label: 'Manage Hair Donations', icon: Heart },
  { id: 'manage-appointments', label: 'Manage Appointments', icon: Calendar },
  { id: 'manage-wig-inventory', label: 'Manage Wig Inventory', icon: Package },
  { id: 'track-donation-status', label: 'Track Donation Status', icon: CheckCircle },
  { id: 'generate-reports', label: 'Generate Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const hospitalPageComponents = {
  dashboard: DashboardPage,
  'manage-hair-donations': ManageHairDonationsPage,
  'manage-appointments': ManageAppointmentsPage,
  'manage-wig-inventory': ManageWigInventoryPage,
  'track-donation-status': TrackDonationStatusPage,
  'generate-reports': GenerateReportsPage,
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
