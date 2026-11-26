'use client';

import { useEffect, useState } from 'react';
import { clearAuthTokens, isLoggedIn, authFetch } from '@/lib/tokenStore';
import { useStoredUser } from '@/lib/useStoredUser';
import DashboardTopbar from '@/components/dashboard/DashboardTopbar';
import DailyHistoryPage from './DailyHistoryPage';
import NewSearchPage from './NewSearchPage';

const PAGES = { daily: DailyHistoryPage, 'new-search': NewSearchPage };

const HEADER_HIDDEN = process.env.NEXT_PUBLIC_IS_Header_Hide === 'true';

// Client shell (tools-5's ProfitLossShell): the topbar session, then the
// page — `page` = 'daily' (home, Daily History) | 'new-search' (the master
// admin's; it checks the role with the server before showing anything).
export default function ResearchShell({ page = 'daily' }) {
  const Page = PAGES[page] || DailyHistoryPage;
  const storedUser = useStoredUser(); // undefined until hydrated
  const [profile, setProfile] = useState(null);
  const user = storedUser && profile ? { ...storedUser, ...profile } : storedUser;

  useEffect(() => {
    if (!isLoggedIn()) return;
    authFetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setProfile(p))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthTokens();
      window.location.href = '/product-research';
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {!HEADER_HIDDEN && <DashboardTopbar user={user} onLogout={handleLogout} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {user !== undefined && <Page signedIn={!!user} />}
      </div>
    </div>
  );
}
