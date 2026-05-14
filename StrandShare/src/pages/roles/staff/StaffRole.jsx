import React from 'react';
import {
  LayoutDashboard,
  Users,
  CheckCircle,
  FileText,
  Package,
  Calendar,
  Settings,
  MapPin,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import ViewDonorInformationsPage from './ViewDonorInformationsPage';
import UpdateDonationStatusPage from './UpdateDonationStatusPage';
import AssignedDonationReportsPage from './AssignedDonationReportsPage';
import UpdateWigRequestStatusPage from './UpdateWigRequestStatusPage';
import ScheduleAppointmentsPage from './ScheduleAppointmentsPage';
import SettingsPage from './SettingsPage';
import ManageDonationRequirementsPage from './ManageDonationRequirementsPage';
import LegalDocumentsPage from '../../shared/features/LegalDocumentsPage';
import LogisticsDestinationSettingsPage from '../../shared/features/LogisticsDestinationSettingsPage';

const staffNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'view-donor-informations', label: 'View Donor Informations', icon: Users },
  { id: 'update-donation-status', label: 'Review Donation Drive', icon: CheckCircle },
  { id: 'assigned-donation-reports', label: 'Assigned Donation Drive', icon: FileText },
  { id: 'update-wig-request-status', label: 'Update Wig Request Status', icon: Package },
  { id: 'schedule-appointments', label: 'Schedule Appointments', icon: Calendar },
  { id: 'manage-donation-requirements', label: 'Manage Donation Requirements', icon: CheckCircle },
  { id: 'logistics-destination-settings', label: 'Logistics Destination Settings', icon: MapPin },
  { id: 'legal-documents', label: 'Legal Documents', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const staffPageComponents = {
  dashboard: DashboardPage,
  'view-donor-informations': ViewDonorInformationsPage,
  'update-donation-status': UpdateDonationStatusPage,
  'assigned-donation-reports': AssignedDonationReportsPage,
  'update-wig-request-status': UpdateWigRequestStatusPage,
  'schedule-appointments': ScheduleAppointmentsPage,
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
