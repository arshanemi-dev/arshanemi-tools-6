import { redirect } from 'next/navigation';

// Old address — what was here is on the New Search page now.
export default function OldPage() {
  redirect('/product-research/new-search');
}
