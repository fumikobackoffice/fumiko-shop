
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { GuestCustomer } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { User, Phone, MapPin, Loader2, History } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface GuestSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGuestSelect: (guest: GuestCustomer) => void;
}

export function GuestSearchDialog({
  isOpen,
  onOpenChange,
  onGuestSelect,
}: GuestSearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const firestore = useFirestore();

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const guestsQuery = useMemoFirebase(() => 
    firestore ? query(collection(firestore, 'guestCustomers'), orderBy('lastPurchaseAt', 'desc')) : null,
    [firestore]
  );
  const { data: guests, isLoading } = useCollection<GuestCustomer>(guestsQuery);

  const filteredGuests = useMemo(() => {
    if (!guests) return [];
    if (!searchTerm) return guests;

    const s = searchTerm.toLowerCase().trim();
    return guests.filter(g => 
      g.name.toLowerCase().includes(s) || 
      g.phone.includes(s)
    );
  }, [searchTerm, guests]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            ค้นหารายชื่อลูกค้าเดิม
          </DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className="mt-4">
          <CommandInput
            placeholder="ค้นหาด้วยชื่อ หรือ เบอร์โทรศัพท์..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList className="max-h-[400px]">
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                กำลังโหลดรายชื่อ...
              </div>
            ) : filteredGuests.length === 0 ? (
              <CommandEmpty>ไม่พบรายชื่อที่ค้นหา</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredGuests.map(guest => (
                  <CommandItem
                    key={guest.id}
                    onSelect={() => onGuestSelect(guest)}
                    className="flex items-center justify-between gap-4 cursor-pointer p-3 border-b last:border-0 hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <span className="font-bold text-sm truncate">{guest.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{guest.phone}</span>
                        <span className="mx-1 opacity-20">|</span>
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{guest.province} {guest.postalCode}</span>
                      </div>
                    </div>
                    {guest.lastPurchaseAt && (
                      <div className="text-[10px] text-muted-foreground text-right shrink-0">
                        ล่าสุด: {format(guest.lastPurchaseAt.toDate(), 'd MMM yy', { locale: th })}
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
