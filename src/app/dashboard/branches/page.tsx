
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Store, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Branch } from '@/lib/types';
import { BranchesTable } from '@/components/dashboard/branches-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { getBranches } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export default function BranchesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Granular Permission Checks
  const canViewBranches = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('branches:view') || perms.includes('branches:manage') || perms.includes('manage_branches');
  }, [user]);

  const canManageBranches = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('branches:manage') || perms.includes('manage_branches');
  }, [user]);

  // Use Centralized Hook
  const { 
    data: branchesData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<Branch[]>({
    key: 'branches-data',
    fetcher: getBranches,
    localStorageKey: 'auto-refresh-branches',
    watchPath: 'branches'
  });

  const branches = branchesData || [];

  // Role protection
  useEffect(() => {
    if (!loading && user && !canViewBranches) {
      router.replace('/dashboard/orders');
    }
  }, [user, loading, router, canViewBranches]);

  const filteredBranches = useMemo(() => {
    if (!searchTerm.trim()) return branches;
    const term = searchTerm.toLowerCase();
    return branches.filter(b => 
      b.name.toLowerCase().includes(term) || 
      b.branchCode.toLowerCase().includes(term) ||
      b.province.toLowerCase().includes(term) ||
      (b.ownerName && b.ownerName.toLowerCase().includes(term))
    );
  }, [branches, searchTerm]);

  // Reset page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredBranches.length / ITEMS_PER_PAGE);
  const paginatedBranches = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBranches.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBranches, currentPage]);

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <Button
          key={i}
          variant={currentPage === i ? "default" : "outline"}
          size="sm"
          className="w-9 h-9 font-medium"
          onClick={() => {
            setCurrentPage(i);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          {i}
        </Button>
      );
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-8 py-4">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => {
            setCurrentPage(prev => Math.max(1, prev - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-1">
          {startPage > 1 && (
            <>
              <Button variant="outline" size="sm" className="w-9 h-9" onClick={() => setCurrentPage(1)}>1</Button>
              {startPage > 2 && <span className="px-2 text-muted-foreground">...</span>}
            </>
          )}
          
          {pageNumbers}
          
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
              <Button variant="outline" size="sm" className="w-9 h-9" onClick={() => setCurrentPage(totalPages)}>{totalPages}</Button>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => {
            setCurrentPage(prev => Math.min(totalPages, prev + 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  if (loading || !user || !canViewBranches) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <Store className="h-8 w-8 text-primary" />
            จัดการสาขา
          </h1>
          <p className="text-muted-foreground">บันทึกและจัดการข้อมูลสาขาทั้งหมดในเครือ</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={refresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
          {canManageBranches && (
            <Button asChild className="h-10 flex-1 sm:flex-none">
              <Link href="/dashboard/branches/new">
                <PlusCircle className="mr-2 h-5 w-5" /> เพิ่มสาขาใหม่
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-grow max-w-md">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อสาขา, รหัส หรือชื่อเจ้าของ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {isLoading && !isRefreshing ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <BranchesTable branches={paginatedBranches} canManage={canManageBranches} />
          {renderPagination()}
        </>
      )}
    </div>
  );
}
