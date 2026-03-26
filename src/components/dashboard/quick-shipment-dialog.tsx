
'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Order, AppUser } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { CustomDialog } from './custom-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirestore } from '@/firebase';
import { doc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, X, ImagePlus, Truck, User, Phone } from 'lucide-react';
import { CarrierCombobox } from './carrier-combobox';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { Separator } from '../ui/separator';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

interface QuickShipmentDialogProps {
  order: Order | null;
  onClose: () => void;
  adminUser: AppUser;
  onSuccess?: () => void;
}

export function QuickShipmentDialog({ order, onClose, adminUser, onSuccess }: QuickShipmentDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  
  const [shipments, setShipments] = useState<{ id: string; carrier: string; trackingNumber: string }[]>([]);
  const [shipmentProofImages, setShipmentProofImages] = useState<string[]>([]);
  const [newCarrier, setNewCarrier] = useState('');
  const [newTrackingNumber, setNewTrackingNumber] = useState('');
  const proofImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (order) {
      setShipments(order.shipments || []);
      setShipmentProofImages(order.shipmentProofImageUrls || []);
    }
  }, [order]);

  if (!order) return null;

  const handleAddShipment = () => {
    if (!newCarrier.trim() || !newTrackingNumber.trim()) {
      toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบ', description: 'กรุณากรอกทั้งบริษัทขนส่งและเลขพัสดุ' });
      return;
    }
    setShipments(prev => [...prev, { id: uuidv4(), carrier: newCarrier, trackingNumber: newTrackingNumber }]);
    setNewCarrier('');
    setNewTrackingNumber('');
  };

  const handleRemoveShipment = (id: string) => setShipments(prev => prev.filter(s => s.id !== id));

  const handleProofImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      if (file.size > 700 * 1024) {
        toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: `รูป ${file.name} มีขนาดเกิน 700KB` });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setShipmentProofImages(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveProofImage = (index: number) => setShipmentProofImages(prev => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    if (!firestore || !adminUser) return;
    
    startTransition(async () => {
      try {
        const batch = writeBatch(firestore);
        const orderRef = doc(firestore, 'orders', order.id);
        
        const dataToUpdate: any = {
          shipments: shipments,
          shipmentProofImageUrls: shipmentProofImages,
          updatedAt: serverTimestamp(),
        };

        if (shipments.length > 0 && order.status === 'READY_TO_SHIP') {
          dataToUpdate.status = 'SHIPPED';
        }

        batch.update(orderRef, dataToUpdate);

        const auditLogRef = doc(collection(firestore, 'auditLogs'));
        batch.set(auditLogRef, {
          adminUserId: adminUser.id,
          adminName: adminUser.name,
          action: 'UPDATE_SHIPMENT',
          targetId: order.id,
          details: { shipmentsCount: shipments.length, imagesCount: shipmentProofImages.length, quickAction: true },
          createdAt: serverTimestamp(),
        });

        await batch.commit();
        
        // Invalidate cache and trigger silent refresh
        clearGlobalCache('admin-orders');
        window.dispatchEvent(new CustomEvent('custom:order-updated'));
        
        toast({ title: 'บันทึกข้อมูลการจัดส่งสำเร็จ' });
        onSuccess?.();
        onClose();
      } catch (error: any) {
        console.error('Failed to update shipment:', error);
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
      }
    });
  };

  return (
    <CustomDialog isOpen={!!order} onClose={onClose} title={`จัดการการจัดส่ง - ออเดอร์ #${order.id.substring(0, 8)}`} size="xl">
      <div className="space-y-6 pt-2">
        {/* ข้อมูลผู้รับพัสดุ */}
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">ข้อมูลผู้รับปลายทาง</Label>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-foreground">{order.customerName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{order.shippingAddress.phone}</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">วิธีจัดส่งที่เลือก</Label>
            <p className="text-xs font-medium mt-1">{order.shippingMethod || '-'}</p>
            {order.lalamoveVehicle && (
              <p className="text-[10px] font-bold text-blue-600 mt-0.5">Lalamove: {order.lalamoveVehicle.type}</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Truck className="h-4 w-4" /> ข้อมูลการจัดส่ง</h3>
          
          <div className="space-y-2">
            {shipments.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
                <div>
                  <p className="text-sm font-medium">{s.carrier}</p>
                  <p className="text-xs text-muted-foreground">{s.trackingNumber}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveShipment(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end border-t pt-4">
            <div className="space-y-1">
              <Label className="text-xs">บริษัทขนส่ง</Label>
              <CarrierCombobox value={newCarrier} onChange={setNewCarrier} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">เลขพัสดุ</Label>
              <Input value={newTrackingNumber} onChange={(e) => setNewTrackingNumber(e.target.value)} placeholder="Tracking No." />
            </div>
            <Button type="button" size="icon" onClick={handleAddShipment} className="shrink-0"><PlusCircle className="h-4 w-4" /></Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-semibold text-sm">หลักฐานการจัดส่ง</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {shipmentProofImages.map((url, index) => (
              <div key={index} className="relative aspect-square">
                <Image src={url} alt={`Proof ${index + 1}`} fill className="rounded-md border object-cover" />
                <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => handleRemoveProofImage(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Label htmlFor="quick-proof-upload" className="cursor-pointer aspect-square flex flex-col items-center justify-center rounded-md border-2 border-dashed bg-muted/25 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
              <ImagePlus className="h-6 w-6" />
              <span className="mt-1 text-[10px] font-medium">เพิ่มรูป</span>
              <Input ref={proofImageInputRef} id="quick-proof-upload" type="file" accept="image/*" multiple className="hidden" onChange={handleProofImageUpload} />
            </Label>
          </div>
          <div className="text-center">
            <a 
              href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground underline hover:text-primary transition-colors"
            >
              อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
            </a>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isPending}>ยกเลิก</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            บันทึกข้อมูล
          </Button>
        </div>
      </div>
    </CustomDialog>
  );
}
