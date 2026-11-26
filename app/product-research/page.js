import { ToastProvider } from '@/components/admin/Toast';
import ResearchShell from '@/components/research/ResearchShell';

export const metadata = {
  title: 'Daily History',
};

// The home page: the filters row + the Daily History table
// (components/research/DailyHistoryPage.jsx). Products and Settings are
// their own pages.
export default function ProductResearchPage() {
  return (
    <ToastProvider>
      <ResearchShell page="daily" />
    </ToastProvider>
  );
}
