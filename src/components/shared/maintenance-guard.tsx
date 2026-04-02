'use client';

import { ReactNode, useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { StoreSettings } from '@/lib/types';
import { Construction, LogOut, Clock, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function CountdownDisplay({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        setTimeLeft('กำลังจะกลับมาเร็วๆ นี้');
        setIsExpired(true);
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days} วัน`);
      if (hours > 0 || days > 0) parts.push(`${hours} ชั่วโมง`);
      parts.push(`${minutes.toString().padStart(2, '0')} นาที`);
      parts.push(`${seconds.toString().padStart(2, '0')} วินาที`);

      setTimeLeft(parts.join(' '));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="mt-6 inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/10">
      <Clock className="h-5 w-5 text-amber-300 shrink-0" />
      <div className="text-left">
        <p className="text-[10px] uppercase tracking-widest text-amber-300/80 font-bold">คาดว่าจะกลับมาใน</p>
        <p className={`text-lg font-mono font-bold tracking-tight ${isExpired ? 'text-emerald-300' : 'text-white'}`}>
          {timeLeft}
        </p>
      </div>
    </div>
  );
}

function MaintenancePage({ settings }: { settings: StoreSettings }) {
  const { logout } = useAuth();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const config = settings.maintenanceMode!;

  const estimatedEnd = useMemo(() => toDate(config.estimatedEndTime), [config.estimatedEndTime]);
  const estimatedEndStr = estimatedEnd
    ? format(estimatedEnd, "d MMMM yyyy 'เวลา' HH:mm 'น.'", { locale: th })
    : null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-auto">
        {/* Animated background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,0.1) 35px, rgba(255,255,255,0.1) 70px)',
          }} />
        </div>

        <div className="relative z-10 w-full max-w-lg mx-auto px-6 py-12 text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center ring-4 ring-amber-500/10 animate-pulse">
            <Construction className="h-10 w-10 text-amber-400" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {config.title || 'ระบบปิดปรับปรุงชั่วคราว'}
            </h1>
            {config.message && (
              <p className="text-base text-slate-300 leading-relaxed whitespace-pre-wrap max-w-md mx-auto">
                {config.message}
              </p>
            )}
          </div>

          {/* Image */}
          {config.imageUrl && (
            <div
              className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl cursor-zoom-in group"
              onClick={() => setIsPreviewOpen(true)}
            >
              <Image
                src={config.imageUrl}
                alt="Maintenance"
                fill
                className="object-contain bg-black/20 transition-transform group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                <div className="bg-black/50 text-white p-2 rounded-full">
                  <Search className="h-5 w-5" />
                </div>
              </div>
            </div>
          )}

          {/* Countdown */}
          {estimatedEnd && <CountdownDisplay targetDate={estimatedEnd} />}

          {/* Estimated end text */}
          {estimatedEndStr && !estimatedEnd && (
            <p className="text-sm text-slate-400">
              คาดว่าจะกลับมาเปิดให้บริการ: <span className="font-bold text-white">{estimatedEndStr}</span>
            </p>
          )}

          {/* Logout */}
          <div className="pt-4">
            <Button
              variant="outline"
              onClick={logout}
              className="bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" />
              ออกจากระบบ
            </Button>
          </div>

          {/* Footer */}
          <p className="text-[11px] text-slate-500 pt-4">
            ขออภัยในความไม่สะดวก ระบบกำลังปรับปรุงเพื่อให้บริการที่ดียิ่งขึ้น
          </p>
        </div>
      </div>

      {/* Full Image Preview */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent shadow-none gap-0 overflow-hidden flex items-center justify-center z-[210]">
          <DialogTitle className="sr-only">รูปภาพขยายใหญ่</DialogTitle>
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            {config.imageUrl && (
              <Image
                src={config.imageUrl}
                alt="Maintenance Full"
                fill
                className="object-contain"
                priority
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white bg-black/40 hover:bg-black/60 rounded-full h-10 w-10 z-50"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MaintenanceGuard({ children }: { children: ReactNode }) {
  const { user, loading, impersonatedUser } = useAuth();
  const firestore = useFirestore();

  const settingsRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'settings', 'store') : null),
    [firestore]
  );
  const { data: storeSettings, isLoading: isSettingsLoading } = useDoc<StoreSettings>(settingsRef);

  // Determine if maintenance is active
  const isMaintenanceActive = storeSettings?.maintenanceMode?.enabled === true;

  // Determine if this user should be blocked
  const shouldBlock = useMemo(() => {
    if (!isMaintenanceActive) return false;
    if (loading || isSettingsLoading) return false; // Don't flash during load

    // Not logged in yet → don't block (let them reach login page)
    if (!user) return false;

    // Admin/Super Admin → never blocked
    if (user.role === 'admin' || user.role === 'super_admin') return false;

    // Admin impersonating a seller → not blocked
    if (impersonatedUser) return false;

    // Seller → blocked
    if (user.role === 'seller') return true;

    return false;
  }, [isMaintenanceActive, user, loading, isSettingsLoading, impersonatedUser]);

  if (shouldBlock && storeSettings) {
    return <MaintenancePage settings={storeSettings} />;
  }

  return <>{children}</>;
}
