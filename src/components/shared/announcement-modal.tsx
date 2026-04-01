
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { StoreSettings } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Megaphone, X, Search } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function AnnouncementModal() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);

  useEffect(() => {
    // Only show to Sellers
    if (!user || user.role !== 'seller' || !storeSettings?.announcement?.active) {
      setIsOpen(false);
      return;
    }

    const { announcement } = storeSettings;
    const version = announcement.updatedAt?.seconds || 'default';
    const frequency = (announcement.frequency as string);

    // Logic for Frequency (handling both current and legacy enum values)
    if (frequency === 'ONLY_ONCE' || frequency === 'ONCE_PER_SESSION') {
      const storageKey = `announcement-seen-${version}`;
      // Check localStorage for "Only Once" - persistent across sessions
      const hasSeenEver = localStorage.getItem(storageKey);
      if (!hasSeenEver) {
        setIsOpen(true);
      }
    } else if (frequency === 'EVERY_LOGIN') {
      // Daily logic: Show once per calendar day
      // Get local date in YYYY-MM-DD format
      const today = new Date().toLocaleDateString('en-CA'); 
      const storageKey = `announcement-daily-${version}-${today}`;
      
      const hasSeenToday = localStorage.getItem(storageKey);
      if (!hasSeenToday) {
        setIsOpen(true);
      }
    }
  }, [user, storeSettings]);

  const handleClose = () => {
    if (storeSettings?.announcement) {
      const { announcement } = storeSettings;
      const version = announcement.updatedAt?.seconds || 'default';
      const frequency = (announcement.frequency as string);

      if (frequency === 'ONLY_ONCE' || frequency === 'ONCE_PER_SESSION') {
        const storageKey = `announcement-seen-${version}`;
        localStorage.setItem(storageKey, 'true');
      } else if (frequency === 'EVERY_LOGIN') {
        const today = new Date().toLocaleDateString('en-CA');
        const storageKey = `announcement-daily-${version}-${today}`;
        localStorage.setItem(storageKey, 'true');
      }
    }
    setIsOpen(false);
  };

  if (!storeSettings?.announcement) return null;

  const { announcement } = storeSettings;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { 
        if (!open && !announcement.hasAckButton) handleClose(); 
      }}>
        <DialogContent className="max-w-xl overflow-hidden p-0 gap-0">
          {announcement.title && (
            <DialogHeader className="p-6 bg-primary/5 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full text-primary">
                  <Megaphone className="h-5 w-5" />
                </div>
                <DialogTitle className="text-xl font-bold font-headline">{announcement.title}</DialogTitle>
              </div>
            </DialogHeader>
          )}
          
          <div className="max-h-[70vh] overflow-y-auto">
            {announcement.imageUrl && (
              <div 
                className="relative w-full aspect-video border-b cursor-zoom-in group bg-muted/20"
                onClick={() => setIsPreviewOpen(true)}
              >
                <Image 
                  src={announcement.imageUrl} 
                  alt="Announcement" 
                  fill 
                  className="object-contain transition-transform group-hover:scale-[1.01]"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5">
                  <div className="bg-black/40 text-white p-2 rounded-full">
                    <Search className="h-5 w-5" />
                  </div>
                </div>
              </div>
            )}
            
            {announcement.content && (
              <div className={cn("p-6", !announcement.title && !announcement.imageUrl && "pt-6")}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {announcement.content}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/30 border-t flex-col sm:flex-row gap-2">
            {announcement.hasAckButton ? (
              <Button onClick={handleClose} className="w-full sm:w-auto font-bold h-11">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                รับทราบข้อมูล
              </Button>
            ) : (
              <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto h-11">
                ปิดหน้าต่าง
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Image Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent shadow-none gap-0 overflow-hidden flex items-center justify-center">
          <DialogTitle className="sr-only">รูปภาพประกาศขยายใหญ่</DialogTitle>
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            {announcement.imageUrl && (
              <Image 
                src={announcement.imageUrl} 
                alt="Full Announcement Image" 
                fill 
                className="object-contain"
                priority
              />
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-4 right-4 text-white bg-black/40 hover:bg-black/60 rounded-full h-10 w-10 z-50 transition-colors"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X className="h-6 w-6" />
              <span className="sr-only">Close preview</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
