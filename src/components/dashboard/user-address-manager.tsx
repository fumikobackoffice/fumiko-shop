
'use client';

import { useState, useTransition } from 'react';
import { UserProfile, Address } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc, writeBatch, getDocs, where } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Trash2, Home, Edit, MapPin, ExternalLink } from 'lucide-react';
import { AddressFormDialog } from './address-form-dialog';
import { CustomDialog } from './custom-dialog';
import { useToast } from '@/hooks/use-toast';

interface UserAddressManagerProps {
  user: UserProfile;
}

export function UserAddressManager({ user }: UserAddressManagerProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addressToEdit, setAddressToEdit] = useState<Address | null>(null);
  
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<Address | null>(null);

  const addressesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users', user.id, 'addresses'), orderBy('isDefault', 'desc'));
  }, [user, firestore]);

  const { data: addresses, isLoading } = useCollection<Address>(addressesQuery);

  const openFormDialog = (address: Address | null) => {
    setAddressToEdit(address);
    setIsFormOpen(true);
  };
  
  const closeFormDialog = () => {
    setAddressToEdit(null);
    setIsFormOpen(false);
  };

  const openDeleteDialog = (address: Address) => {
    setAddressToDelete(address);
    setIsConfirmDeleteOpen(true);
  }

  const handleDeleteAddress = () => {
    if (!firestore || !user || !addressToDelete) return;

    startTransition(async () => {
      try {
        await deleteDoc(doc(firestore, 'users', user.id, 'addresses', addressToDelete.id));
        toast({ title: 'ลบที่อยู่สำเร็จ' });
      } catch (error: any) {
        console.error('Error deleting address: ', error);
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถลบที่อยู่ได้' });
      } finally {
        setIsConfirmDeleteOpen(false);
        setAddressToDelete(null);
      }
    });
  }

  const handleSetDefault = (address: Address) => {
    if (!firestore || !user || address.isDefault) return;

    startTransition(async () => {
        const batch = writeBatch(firestore);
        const addressesRef = collection(firestore, 'users', user.id, 'addresses');
        
        const q = query(addressesRef, where('isDefault', '==', true));
        const oldDefaults = await getDocs(q);
        oldDefaults.forEach(docSnap => {
            batch.update(docSnap.ref, { isDefault: false });
        });

        const newDefaultRef = doc(addressesRef, address.id);
        batch.update(newDefaultRef, { isDefault: true });

        try {
            await batch.commit();
            toast({ title: 'ตั้งเป็นที่อยู่หลักแล้ว' });
        } catch(error: any) {
            console.error("Error setting default address:", error);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถตั้งค่าที่อยู่หลักได้" });
        }
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">ที่อยู่สำหรับจัดส่ง</CardTitle>
            <CardDescription>จัดการที่อยู่สำหรับจัดส่งสินค้าทั้งหมดของผู้ใช้นี้</CardDescription>
          </div>
          <Button onClick={() => openFormDialog(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มที่อยู่ใหม่
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !addresses || addresses.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              <MapPin className="mx-auto h-8 w-8 mb-2" />
              <p>ยังไม่มีที่อยู่ที่บันทึกไว้</p>
            </div>
          ) : (
            <div className="space-y-4">
              {addresses.map((address) => (
                <div key={address.id} className="border p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <p className="font-semibold">{address.label || 'ที่อยู่'}</p>
                        {address.isDefault && <Badge><Home className="mr-1.5 h-3 w-3" /> ที่อยู่หลัก</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{address.name}, {address.phone}</p>
                    <p className="text-sm text-muted-foreground">{address.addressLine1}</p>
                    {address.addressLine2 && <p className="text-sm text-muted-foreground">{address.addressLine2}</p>}
                    <p className="text-sm text-muted-foreground">{`${address.subdistrict}, ${address.district}, ${address.province} ${address.postalCode}`}</p>
                    {address.googleMapsUrl && (
                        <a 
                          href={address.googleMapsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-2 font-medium"
                        >
                            <MapPin className="h-3 w-3" />
                            เปิดใน Google Maps
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                  </div>
                  <div className="flex gap-1 w-full sm:w-auto justify-end">
                     {!address.isDefault && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetDefault(address)} disabled={isPending}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : 'ตั้งเป็นหลัก'}
                        </Button>
                     )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormDialog(address)}><Edit className="h-4 w-4"/></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => openDeleteDialog(address)}><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <AddressFormDialog
        userId={user.id}
        addressToEdit={addressToEdit}
        isOpen={isFormOpen}
        onClose={closeFormDialog}
        onSuccess={closeFormDialog}
      />

       <CustomDialog
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title="ยืนยันการลบที่อยู่"
      >
        <p className="text-sm text-muted-foreground">
          คุณแน่ใจหรือไม่ว่าต้องการลบที่อยู่นี้อย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setIsConfirmDeleteOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleDeleteAddress} variant="destructive" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ยืนยันการลบ
          </Button>
        </div>
      </CustomDialog>
    </>
  );
}
