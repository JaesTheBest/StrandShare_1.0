import React from 'react';
import {
  LayoutDashboard,
  ScanLine,
  Package,
  Sparkles,
  PackagePlus,
  FileBarChart2,
  Settings,
} from 'lucide-react';
import RoleDashboardShell from '../../shared/RoleDashboardShell';
import DashboardPage from './DashboardPage';
import QualityCheckPage from './QualityCheckPage';
import BundlingPage from './BundlingPage';
import HairstyleMakingPage from './HairstyleMakingPage';
import UploadWigStocksPage from './UploadWigStocksPage';
import GenerateReportsPage from './GenerateReportsPage';
import SettingsPage from './SettingsPage';

const specialistNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'quality-check', label: 'Quality Check', icon: ScanLine },
  { id: 'bundling', label: 'Bundling', icon: Package },
  { id: 'hairstyle-making', label: 'Hairstyle Making', icon: Sparkles },
  { id: 'upload-wig-stocks', label: 'Upload Wig Stocks', icon: PackagePlus },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const specialistPageComponents = {
  dashboard: DashboardPage,
  'quality-check': QualityCheckPage,
  bundling: BundlingPage,
  'hairstyle-making': HairstyleMakingPage,
  'upload-wig-stocks': UploadWigStocksPage,
  reports: GenerateReportsPage,
  settings: SettingsPage,
};

export default function SpecialistRole({ onSignOut, userProfile }) {
  return (
    <RoleDashboardShell
      onSignOut={onSignOut}
      userProfile={userProfile}
      navItems={specialistNavItems}
      pageComponents={specialistPageComponents}
      defaultPage="dashboard"
    />
  );
}
