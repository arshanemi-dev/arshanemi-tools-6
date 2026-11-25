'use client';

import { useEffect, useState } from 'react';
import { clearAuthTokens, isLoggedIn, authFetch } from '@/lib/tokenStore';
import { useStoredUser } from '@/lib/useStoredUser';
import DashboardTopbar from '@/components/dashboard/DashboardTopbar';
import ResearchWorkspace from './ResearchWorkspace';

const HEADER_HIDDEN = process.env.NEXT_PUBLIC_IS_Header_Hide === 'true';

// Client shell (tools-5's ProfitLossShell): the topbar session, then the
// workspace. The page opens signed out too; searching asks to sign in.
export default function ResearchShell() {
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
        {user !== undefined && <ResearchWorkspace signedIn={!!user} />}
      </div>
    </div>
  );
}
