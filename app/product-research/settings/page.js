import { ToastProvider } from '@/components/admin/Toast';
import SettingsShell from '@/components/research/SettingsShell';

export const metadata = {
  title: 'Settings',
};

// Thin shell — the Settings page (delete your data; the master admin's
// storage tools) lives in <SettingsPage/> (client).
export default function ProductResearchSettingsPage() {
  return (
    <ToastProvider>
      <SettingsShell />
    </ToastProvider>
  );
}
