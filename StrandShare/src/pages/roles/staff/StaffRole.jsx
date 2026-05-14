import React from 'react';
import {
  LayoutDashboard,
  CheckCircle,
  FileText,
  Package,
  Settings,
  MapPin,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import UpdateDonationStatusPage from './UpdateDonationStatusPage';
import AssignedDonationReportsPage from './AssignedDonationReportsPage';
import UpdateWigRequestStatusPage from './UpdateWigRequestStatusPage';
import SettingsPage from './SettingsPage';
import ManageDonationRequirementsPage from './ManageDonationRequirementsPage';
import LegalDocumentsPage from '../../shared/features/LegalDocumentsPage';
import LogisticsDestinationSettingsPage from '../../shared/features/LogisticsDestinationSettingsPage';

const staffNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'update-donation-status', label: 'Review Donation Drive', icon: CheckCircle },
  { id: 'assigned-donation-reports', label: 'Assigned Donation Drive', icon: FileText },
  { id: 'update-wig-request-status', label: 'Update Wig Request Status', icon: Package },
  { id: 'manage-donation-requirements', label: 'Manage Donation Requirements', icon: CheckCircle },
  { id: 'logistics-destination-settings', label: 'Logistics Destination Settings', icon: MapPin },
  { id: 'legal-documents', label: 'Legal Documents', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const staffPageComponents = {
  dashboard: DashboardPage,
  'update-donation-status': UpdateDonationStatusPage,
  'assigned-donation-reports': AssignedDonationReportsPage,
  'update-wig-request-status': UpdateWigRequestStatusPage,
  'manage-donation-requirements': ManageDonationRequirementsPage,
  'logistics-destination-settings': LogisticsDestinationSettingsPage,
  'legal-documents': LegalDocumentsPage,
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
