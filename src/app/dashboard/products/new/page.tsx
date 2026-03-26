'use client';

import { ProductForm } from '@/components/dashboard/product-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function NewProductPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Check
  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canManageInventory) {
      router.replace('/dashboard/products');
    }
  }, [user, loading, router, canManageInventory]);

  if (loading || !user || !canManageInventory) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <Button 
        variant="ghost" 
        onClick={() => router.back()} 
        className="-ml-4 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        ย้อนกลับ
      </Button>
      <h1 className="text-3xl font-headline font-bold">เพิ่มสินค้าใหม่</h1>
      <ProductForm />
    </div>
  );
}
