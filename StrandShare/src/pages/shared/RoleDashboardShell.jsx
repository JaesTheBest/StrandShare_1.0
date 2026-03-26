import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import { logAuditAction } from '../../lib/auditLogger';

export default function RoleDashboardShell({
  onSignOut,
  userProfile,
  navItems,
  defaultPage = 'dashboard',
  pageComponents = {},
}) {
  const [currentPage, setCurrentPage] = useState(defaultPage);

  const pageTitle = useMemo(() => {
    const activeNavItem = navItems.find((item) => item.id === currentPage);
    return activeNavItem?.label || 'Overview';
  }, [currentPage, navItems]);

  const ActivePage = pageComponents[currentPage] || pageComponents[defaultPage] || null;
  const isOverviewPage = currentPage === 'dashboard';
  const pageWrapperClass = isOverviewPage
    ? 'flex-1 overflow-auto'
    : 'flex-1 overflow-auto p-8 bg-gray-50 dark:bg-gray-950';

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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} items={navItems} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onSignOut={onSignOut} userProfile={userProfile} pageTitle={pageTitle} />
        <div className={pageWrapperClass}>
          {ActivePage ? (
            <ActivePage userProfile={userProfile} />
          ) : (
            <div className="p-8 text-gray-600 dark:text-gray-300">Page not available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
