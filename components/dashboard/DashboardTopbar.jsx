'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
import { redirectToLogin } from '@/lib/authGate';

// The dark navbar: logo, one link — Product Research — and login / account
// (the master admin's New Search page is in the account menu). `user` is
// undefined until the browser has read the stored session (useStoredUser) —
// an empty slot then, so neither "Log in" nor the menu flashes the wrong way.
export default function DashboardTopbar({ user, onLogout }) {
  const pathname = usePathname() || '';
  return (
    <header className="sticky top-0 z-50 flex-shrink-0 border-b border-white/10 bg-footer">
      <div className="w-full px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 py-3 sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center">
            <Image src="/images/barmeto-logo.png" alt="Barmeto" width={132} height={40} className="h-9 w-auto rounded-lg" priority />
          </Link>

          <nav aria-label="Product Research" className="flex min-w-0 flex-1 items-center justify-center">
            <Link
              href="/product-research"
              aria-current={pathname === '/product-research' ? 'page' : undefined}
              className="whitespace-nowrap text-sm font-semibold text-white underline decoration-2 underline-offset-8"
            >
              Product Research
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {user === undefined ? (
              <span aria-hidden="true" className="block h-9 w-9" />
            ) : user ? (
              <UserMenu user={user} onLogout={onLogout} />
            ) : (
              <button
                type="button"
                onClick={redirectToLogin}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-white px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-white/90"
              >
                Log in
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
