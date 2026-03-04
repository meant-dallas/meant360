import AppLayout from '@/components/layout/AppLayout';
import { YearProvider } from '@/contexts/YearContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <YearProvider>
      <AppLayout>{children}</AppLayout>
    </YearProvider>
  );
}
