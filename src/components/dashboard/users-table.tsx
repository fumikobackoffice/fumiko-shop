'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pen, Trash2, UserX, RotateCw, Eye, IdCard } from 'lucide-react';
import { UserProfile, AppUser } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { ActionType } from '@/app/dashboard/users/page';
import { useRouter, usePathname } from 'next/navigation';
import { Checkbox } from '../ui/checkbox';
import { UserQuickView } from './user-quick-view';

const getRoleVariant = (role: UserProfile['role']) => {
  switch (role) {
    case 'super_admin':
      return 'destructive';
    case 'admin':
      return 'default';
    case 'seller':
      return 'secondary';
    default:
      return 'default';
  }
};

const getRoleText = (role: UserProfile['role']) => {
    switch (role) {
      case 'super_admin':
        return 'ผู้ดูแลระบบระดับสูงสุด';
      case 'admin':
        return 'ผู้ดูแลระบบ';
      case 'seller':
        return 'เจ้าของสาขา';
      default:
        return role;
    }
  };

interface UsersTableProps {
  users: UserProfile[];
  currentUser: AppUser | null;
  activeTab: string;
  openDialog: (user: UserProfile, action: ActionType) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  canManage: boolean;
}

export function UsersTable({ users, currentUser, activeTab, openDialog, selectedIds, onSelectedIdsChange, canManage }: UsersTableProps) {
  const isArchivedTab = activeTab === 'archived';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin';
  const router = useRouter();
  const pathname = usePathname();

  const [quickViewUser, setQuickViewUser] = useState<UserProfile | null>(null);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    // Only select users that are NOT super_admin for bulk actions
    onSelectedIdsChange(checked === true ? users.filter(u => u.role !== 'super_admin').map(u => u.id) : []);
  }

  const selectablesCount = users.filter(u => u.role !== 'super_admin').length;
  const selectedCount = selectedIds.length;
  const isAllSelected = selectablesCount > 0 && selectedCount === selectablesCount;
  const isSomeSelected = selectedCount > 0 && selectedCount < selectablesCount;

  if (users.length === 0) {
    return (
        <div className="text-center p-8 text-muted-foreground border rounded-lg">
          ไม่พบข้อมูลผู้ใช้ในหมวดหมู่นี้
        </div>
    )
  }

  const handleEditClick = (user: UserProfile) => {
      setTimeout(() => {
        if (pathname.includes('/staff')) {
            router.push(`/dashboard/staff/${user.id}/edit`);
        } else {
            router.push(`/dashboard/users/${user.id}/edit`);
        }
      }, 100);
  };

  const handleAction = (user: UserProfile, action: ActionType) => {
    if (!canManage) return;
    setTimeout(() => {
      openDialog(user, action);
    }, 100);
  };


  return (
    <>
      <div className="rounded-lg border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 px-4 text-center">
                  <Checkbox
                    checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                    disabled={!canManage && !isArchivedTab}
                  />
              </TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead>อีเมล</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead className="whitespace-nowrap text-right">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} data-state={selectedIds.includes(user.id) ? "selected" : ""}>
                 <TableCell className="px-4 text-center">
                    <Checkbox
                        checked={selectedIds.includes(user.id)}
                        disabled={user.role === 'super_admin' || (!canManage && !isArchivedTab)}
                        onCheckedChange={(checked) => {
                            if (checked) {
                                onSelectedIdsChange([...selectedIds, user.id]);
                            } else {
                                onSelectedIdsChange(selectedIds.filter(id => id !== user.id));
                            }
                        }}
                        aria-label={`Select user ${user.name}`}
                    />
                </TableCell>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={getRoleVariant(user.role)} className="text-[10px]">{getRoleText(user.role)}</Badge>
                </TableCell>
                <TableCell className='text-right'>
                  <div className="flex items-center justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-primary hover:bg-primary/10"
                      onClick={() => setQuickViewUser(user)}
                      title="ดูข้อมูลสรุป"
                    >
                      <IdCard className="h-4 w-4" />
                    </Button>

                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isArchivedTab ? (
                          <>
                            {canManage && (
                              <DropdownMenuItem 
                                  onSelect={() => handleAction(user, 'restore')}
                                  disabled={user.role === 'super_admin'}
                              >
                                <RotateCw className="mr-2 h-4 w-4" />
                                กู้คืน
                              </DropdownMenuItem>
                            )}
                            {isSuperAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                  onSelect={() => handleAction(user, 'delete')}
                                  disabled={user.role === 'super_admin'}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  ลบถาวร
                                </DropdownMenuItem>
                              </>
                            )}
                            {!canManage && !isSuperAdmin && <DropdownMenuItem disabled>ไม่มีสิทธิ์จัดการ</DropdownMenuItem>}
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem 
                              onSelect={() => handleEditClick(user)}
                              disabled={user.role === 'super_admin' && !isAdmin}
                            >
                              {canManage ? <Pen className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                              {canManage ? 'แก้ไข' : 'ดูรายละเอียด'}
                            </DropdownMenuItem>
                            {canManage && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                    onSelect={() => handleAction(user, 'archive')}
                                    disabled={user.role === 'super_admin' || user.id === currentUser?.id}
                                >
                                  <UserX className="mr-2 h-4 w-4" />
                                  ปิดใช้งาน
                                </DropdownMenuItem>
                              </>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserQuickView 
        user={quickViewUser}
        isOpen={!!quickViewUser}
        onClose={() => setQuickViewUser(null)}
      />
    </>
  );
}
