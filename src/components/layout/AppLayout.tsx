import { Outlet, Navigate } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { Loader2 } from 'lucide-react';

export function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <CompanyProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <TopNav />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <div className="container py-6 max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </CompanyProvider>
  );
}
