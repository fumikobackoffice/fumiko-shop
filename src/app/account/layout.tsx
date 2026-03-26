
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Header } from '@/components/shared/header';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      }
      // Removed the role !== 'seller' restriction to allow admins to view their profiles
    }
  }, [user, loading, router]);

  if (loading || !user) {
     return (
        <div className="h-screen w-screen flex items-center justify-center bg-background">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
     );
  }
  
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-4 px-2 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
