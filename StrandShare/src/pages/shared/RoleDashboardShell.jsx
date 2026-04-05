import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import { logAuditAction } from '../../lib/auditLogger';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'strandshare.sidebar.collapsed';

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function RoleDashboardShell({
  onSignOut,
  userProfile,
  navItems,
  defaultPage = 'dashboard',
  pageComponents = {},
}) {
  const [currentPage, setCurrentPage] = useState(defaultPage);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarCollapsed);

  const pageTitle = useMemo(() => {
    const activeNavItem = navItems.find((item) => item.id === currentPage);
    return activeNavItem?.label || 'Overview';
  }, [currentPage, navItems]);

  const ActivePage = pageComponents[currentPage] || pageComponents[defaultPage] || null;
  const hasSettingsPage = Boolean(pageComponents.settings) || navItems.some((item) => item.id === 'settings');
  const pageWrapperClass = 'flex-1 overflow-auto bg-slate-50 p-6 md:p-8';

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!currentPage) {
      return;
    }

    void logAuditAction({
      action: 'navigation.view_page',
      description: `Viewed page: ${pageTitle}`,
      resource: `page/${currentPage}`,
      status: 'success',
      userProfile,
    });
  }, [currentPage, pageTitle, userProfile]);

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        items={navItems}
        isCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((previous) => !previous)}
      />
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <Header
          onSignOut={onSignOut}
          onOpenSettings={hasSettingsPage ? () => setCurrentPage('settings') : undefined}
          userProfile={userProfile}
          pageTitle={pageTitle}
        />
        <div className={pageWrapperClass}>
          {ActivePage ? (
            <ActivePage userProfile={userProfile} />
          ) : (
            <div className="p-8 text-slate-600">Page not available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
