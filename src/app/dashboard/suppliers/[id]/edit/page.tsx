
'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function RedirectEditSupplier() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  useEffect(() => {
    if (id) {
      router.replace(`/dashboard/suppliers?id=${id}`);
    } else {
      router.replace('/dashboard/suppliers');
    }
  }, [router, id]);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}
