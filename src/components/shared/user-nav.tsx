
'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { 
  LayoutDashboard, 
  LogOut, 
  User as UserIcon, 
  Home, 
  ClipboardList, 
  CreditCard, 
  BookText,
  ShoppingCart
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function UserNav() {
  const { user, logout, impersonatedUser } = useAuth();
  const router = useRouter();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => router.push('/login')}>เข้าสู่ระบบ</Button>
      </div>
    );
  }

  const getInitials = (name: string | null) => {
    if (!name) return '';
    const names = name.split(' ');
    return names.map((n) => n[0]).join('').toUpperCase();
  };

  const isSeller = user.role === 'seller';
  const showSellerMenus = isSeller || impersonatedUser;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="relative h-11 w-11 rounded-xl border-muted-foreground/20 bg-background/50 hover:bg-muted/50 transition-colors"
        >
          <UserIcon className="h-5 w-5" />
          <span className="sr-only">เมนูผู้ใช้งาน</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center gap-2 mb-1">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://avatar.vercel.sh/${user.email}.png`} alt={user.name} />
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <p className="text-sm font-bold leading-none truncate">{user.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'เจ้าของสาขา'}
                  </p>
                </div>
            </div>
            <p className="text-[10px] leading-none text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        {showSellerMenus && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/shop" className="cursor-pointer">
                  <Home className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">หน้าหลัก (สั่งซื้อสินค้า)</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="cursor-pointer">
                  <LayoutDashboard className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">สรุปผลการดำเนินงาน</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/orders" className="cursor-pointer">
                  <ClipboardList className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">ประวัติการสั่งซื้อ</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/fees" className="cursor-pointer">
                  <CreditCard className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">รายการค้างชำระ</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/points" className="cursor-pointer">
                  <BookText className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">สมุดคะแนนสะสม</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/account/profile" className="cursor-pointer">
              <UserIcon className="mr-2 h-4 w-4" />
              <span>จัดการข้อมูลส่วนตัว</span>
            </Link>
          </DropdownMenuItem>
          
          {!showSellerMenus && (
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>ไปที่แดชบอร์ดแอดมิน</span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>ออกจากระบบ</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
