'use client';

import ResearchShell from './ResearchShell';
import SettingsPage from './SettingsPage';

// The Settings page inside the same topbar shell as the dashboard.
export default function SettingsShell() {
  return <ResearchShell>{(signedIn) => <SettingsPage signedIn={signedIn} />}</ResearchShell>;
}
