import React from 'react';
import {
  LayoutDashboard,
  Clipboard,
  Users,
  CheckCircle,
  Award,
  BarChart3,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import SubmitDonationsRequestPage from './SubmitDonationsRequestPage';
import CoordinateDonationProgramsPage from './CoordinateDonationProgramsPage';
import ReferPatientsDonorsPage from './ReferPatientsDonorsPage';
import TrackDonationStatusPage from './TrackDonationStatusPage';
import GenerateCertificatePage from './GenerateCertificatePage';
import GenerateReportPage from './GenerateReportPage';
import SettingsPage from './SettingsPage';

const organizationNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'submit-donations-request', label: 'Request Donation Drive', icon: Clipboard },
  { id: 'coordinate-donation-programs', label: 'Coordinate Donation Programs', icon: Users },
  { id: 'refer-patients-and-donors', label: 'Refer Patients and Donors', icon: Users },
  { id: 'track-donation-status', label: 'Track Donation Status', icon: CheckCircle },
  { id: 'generate-certificate', label: 'Generate Certificate', icon: Award },
  { id: 'generate-report', label: 'Generate Report', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const organizationPageComponents = {
  dashboard: DashboardPage,
  'submit-donations-request': SubmitDonationsRequestPage,
  'coordinate-donation-programs': CoordinateDonationProgramsPage,
  'refer-patients-and-donors': ReferPatientsDonorsPage,
  'track-donation-status': TrackDonationStatusPage,
  'generate-certificate': GenerateCertificatePage,
  'generate-report': GenerateReportPage,
  settings: SettingsPage,
};

export default function OrganizationRole({ onSignOut, userProfile }) {
  return (
    <RoleDashboardShell
      onSignOut={onSignOut}
      userProfile={userProfile}
      navItems={organizationNavItems}
      pageComponents={organizationPageComponents}
      defaultPage="dashboard"
    />
  );
}
