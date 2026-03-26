'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role === 'super_admin' || user.role === 'admin') {
        router.replace('/dashboard');
      } else if (user.role === 'seller') {
        // Sellers should land on the shop page by default
        router.replace('/shop');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
    </div>
  );
}
