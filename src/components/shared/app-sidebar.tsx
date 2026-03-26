'use client';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/shared/logo';
import { 
  Home, 
  ClipboardList, 
  Store, 
  Users, 
  ShoppingBag, 
  Warehouse, 
  Factory, 
  Network, 
  Package, 
  Settings, 
  LogOut,
  ChevronDown,
  BarChart3,
  CreditCard,
  BookText,
  ShoppingCart,
  Briefcase,
  LayoutDashboard,
  ShieldCheck,
  FileText,
  UserPlus,
  History,
  FilePlus
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Order, FeeInvoice } from '@/lib/types';
import { syncRecurringInvoices } from '@/app/actions';

export function AppSidebar() {
  const { user, logout, impersonatedUser } = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const isSeller = user?.role === 'seller';

  if (isSeller || impersonatedUser) {
    return null;
  }

  const hasPermission = (module: string, level: 'view' | 'manage' = 'view') => {
    if (isSuperAdmin) return true;
    if (isSeller || !user) return false;
    
    const perms = user.permissions || [];
    
    if (perms.includes(`${module}:${level}`)) return true;
    if (level === 'view' && perms.includes(`${module}:manage`)) return true;
    
    const legacyMap: Record<string, string> = {
        'revenue': 'view_revenue',
        'orders': 'manage_orders',
        'shipping': 'manage_shipping',
        'inventory': 'manage_inventory',
        'suppliers': 'manage_suppliers',
        'branches': 'manage_branches',
        'customers': 'manage_customers',
        'system': 'manage_system'
    };
    
    const oldKey = legacyMap[module];
    if (oldKey && perms.includes(oldKey)) {
        if (module === 'revenue' && level === 'manage') return false;
        return true;
    }

    return false;
  };

  useEffect(() => {
    if (isAdmin || isSuperAdmin) {
      syncRecurringInvoices().catch(err => console.error("Auto-sync failed:", err));
    }
  }, [isAdmin, isSuperAdmin, pathname]);

  const canViewOrders = hasPermission('orders', 'view');
  const processingOrdersQuery = useMemoFirebase(() => {
    if (!firestore || !user || !canViewOrders) return null;
    return query(collection(firestore, 'orders'), where('status', '==', 'PROCESSING'));
  }, [firestore, user, canViewOrders]);

  const { data: processingOrders } = useCollection<Order>(processingOrdersQuery);
  const processingOrderCount = processingOrders?.length ?? 0;

  const canViewFees = hasPermission('branches', 'view');
  const processingInvoicesQuery = useMemoFirebase(() => {
    if (!firestore || !user || !canViewFees) return null;
    return query(collection(firestore, 'feeInvoices'), where('status', '==', 'PROCESSING'));
  }, [firestore, user, canViewFees]);
  const { data: processingInvoices } = useCollection<FeeInvoice>(processingInvoicesQuery);
  const processingInvoiceCount = processingInvoices?.length ?? 0;

  const isActive = (path: string) => pathname === path || (path !== '/dashboard' && pathname.startsWith(path));

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="py-4">
        <Logo />
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              isActive={pathname === '/dashboard'} 
              tooltip="แดชบอร์ด"
            >
              <Link href="/dashboard">
                <Home className="h-4 w-4" />
                <span className="font-medium">แดชบอร์ดสรุปผล</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-2 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="flex h-4 w-4 items-center justify-center">
              <ChevronDown className="h-3 w-3" />
            </span>
            การจัดการ
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="border-l ml-3.5 pl-2 space-y-1">
              {hasPermission('orders', 'manage') && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive('/dashboard/external-bill')} className="bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10">
                      <Link href="/dashboard/external-bill">
                        <FilePlus className="h-4 w-4" />
                        <span className="font-bold">เปิดบิลอิสระ (ภายนอก)</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive('/dashboard/admin-order')} className="bg-primary/5 text-primary hover:bg-primary/10">
                      <Link href="/dashboard/admin-order">
                        <UserPlus className="h-4 w-4" />
                        <span className="font-bold">สร้างออเดอร์ให้ลูกค้า</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              {hasPermission('orders', 'view') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/orders')} className="justify-between">
                    <Link href="/dashboard/orders">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        <span>รายการสั่งซื้อทั้งหมด</span>
                      </div>
                      {processingOrderCount > 0 && hasPermission('orders', 'manage') && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {processingOrderCount > 9 ? '9+' : processingOrderCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {hasPermission('branches', 'view') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/fees')} className="justify-between">
                    <Link href="/dashboard/fees">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span>จัดการบิลค่าธรรมเนียม</span>
                      </div>
                      {processingInvoiceCount > 0 && hasPermission('branches', 'manage') && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {processingInvoiceCount > 9 ? '9+' : processingInvoiceCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {hasPermission('revenue', 'view') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/branch-insights')}>
                    <Link href="/dashboard/branch-insights">
                      <BarChart3 className="h-4 w-4" />
                      <span>วิเคราะห์สาขา</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {hasPermission('branches', 'view') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/branches')}>
                    <Link href="/dashboard/branches">
                      <Store className="h-4 w-4" />
                      <span>รหัสสาขา</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {hasPermission('customers', 'view') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/users')}>
                    <Link href="/dashboard/users">
                      <Users className="h-4 w-4" />
                      <span>เจ้าของสาขา</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {hasPermission('inventory', 'view') && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2 px-2 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <ChevronDown className="h-3 w-3" />
              งานบริการ
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="border-l ml-3.5 pl-2 space-y-1">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/dashboard/services' || (pathname.startsWith('/dashboard/services/') && !pathname.includes('categories'))}>
                    <Link href="/dashboard/services">
                      <Briefcase className="h-4 w-4" />
                      <span>รายการบริการ</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/services/categories')}>
                    <Link href="/dashboard/services/categories">
                      <Network className="h-4 w-4" />
                      <span>หมวดหมู่บริการ</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(hasPermission('inventory', 'view') || hasPermission('suppliers', 'view')) && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2 px-2 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <ChevronDown className="h-3 w-3" />
              คลังสินค้า
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="border-l ml-3.5 pl-2 space-y-1">
                {hasPermission('inventory', 'view') && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive('/dashboard/products')}>
                        <Link href="/dashboard/products">
                          <ShoppingBag className="h-4 w-4" />
                          <span>สินค้า</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive('/dashboard/packages')}>
                        <Link href="/dashboard/packages">
                          <Package className="h-4 w-4" />
                          <span>แพ็กเกจ</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive('/dashboard/purchase-orders')}>
                        <Link href="/dashboard/purchase-orders">
                          <Warehouse className="h-4 w-4" />
                          <span>การจัดซื้อและรับของ</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive('/dashboard/inventory-ledger')}>
                        <Link href="/dashboard/inventory-ledger">
                          <History className="h-4 w-4" />
                          <span>สมุดรายวันคลังสินค้า</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
                {hasPermission('suppliers', 'view') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive('/dashboard/suppliers')}>
                      <Link href="/dashboard/suppliers">
                        <Factory className="h-4 w-4" />
                        <span>แหล่งจัดซื้อ</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {hasPermission('inventory', 'view') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive('/dashboard/categories')}>
                      <Link href="/dashboard/categories">
                        <Network className="h-4 w-4" />
                        <span>หมวดหมู่สินค้า</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hasPermission('system', 'view') && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2 px-2 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <ChevronDown className="h-3 w-3" />
              ระบบ
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="border-l ml-3.5 pl-2 space-y-1">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/staff')}>
                    <Link href="/dashboard/staff">
                      <ShieldCheck className="h-4 w-4" />
                      <span>พนักงาน / แอดมิน</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/dashboard/settings')}>
                    <Link href="/dashboard/settings">
                      <Settings className="h-4 w-4" />
                      <span>ตั้งค่า</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => logout()} className="text-destructive hover:text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              <span>ออกจากระบบ</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
