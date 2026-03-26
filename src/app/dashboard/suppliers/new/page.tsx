
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectNewSupplier() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/dashboard/suppliers?action=new');
  }, [router]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}
