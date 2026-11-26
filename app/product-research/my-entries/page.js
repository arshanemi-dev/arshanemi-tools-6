import { ToastProvider } from '@/components/admin/Toast';
import ResearchShell from '@/components/research/ResearchShell';

export const metadata = {
  title: 'Product Categories',
};

// Every signed-in user's own entry list: all entries in a table with
// Add / Remove (components/research/MyEntriesPage.jsx). Product Research's
// Entries dropdown lists only the saved ones.
export default function MyEntriesRoute() {
  return (
    <ToastProvider>
      <ResearchShell page="my-entries" />
    </ToastProvider>
  );
}
