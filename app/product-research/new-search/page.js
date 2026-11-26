import { ToastProvider } from '@/components/admin/Toast';
import ResearchShell from '@/components/research/ResearchShell';

export const metadata = {
  title: 'New Search',
};

// The master admin's page: add entries (market place → category → link →
// pages), the entries table (Search now, Daily switch, delete), an entry's
// products, storage tools (components/research/NewSearchPage.jsx). It shows
// nothing until the server confirms the role; the API refuses everyone else.
export default function NewSearchRoute() {
  return (
    <ToastProvider>
      <ResearchShell page="new-search" />
    </ToastProvider>
  );
}
