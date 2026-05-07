import React from 'react';
import {
  LayoutDashboard,
  Clipboard,
  CalendarSearch,
  Users,
  Award,
  History,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import SubmitDonationsRequestPage from './SubmitDonationsRequestPage';
import ViewDrivePage from './ViewDrivePage';
import ManageOrganizationMembersPage from './ManageOrganizationMembersPage';
import GenerateCertificatePage from './GenerateCertificatePage';
import DonationEventHistoryPage from './DonationEventHistoryPage';
import SettingsPage from './SettingsPage';

const organizationNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'submit-donations-request', label: 'Request Donation Drive', icon: Clipboard },
  { id: 'view-drive', label: 'View Drive', icon: CalendarSearch },
  { id: 'manage-organization-members', label: 'Manage Organization Members', icon: Users },
  { id: 'generate-certificate', label: 'Generate Certificate', icon: Award },
  { id: 'donation-event-history', label: 'Donation Event History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const organizationPageComponents = {
  dashboard: DashboardPage,
  'submit-donations-request': SubmitDonationsRequestPage,
  'view-drive': ViewDrivePage,
  'manage-organization-members': ManageOrganizationMembersPage,
  'generate-certificate': GenerateCertificatePage,
  'donation-event-history': DonationEventHistoryPage,
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
