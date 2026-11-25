import { ToastProvider } from '@/components/admin/Toast';
import ResearchShell from '@/components/research/ResearchShell';

export const metadata = {
  title: 'Product Research',
};

// Thin shell — everything lives in <ResearchShell/> (client).
export default function ProductResearchPage() {
  return (
    <ToastProvider>
      <ResearchShell />
    </ToastProvider>
  );
}
