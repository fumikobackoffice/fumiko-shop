'use client';

import { useState, useTransition, useEffect } from 'react';
import { FeeInvoice, BankAccount } from '@/lib/types';
import { CustomDialog } from './custom-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Upload, Loader2, Copy, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import Image from 'next/image';
import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { useUploadImage } from '@/firebase/storage/use-storage';

export function FeePaymentDialog({ invoice, onClose }: { invoice: FeeInvoice | null, onClose: () => void }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const bankAccountsQuery = useMemoFirebase(() => 
    firestore ? query(collection(firestore, 'bankAccounts'), where('isActive', '==', true), limit(1)) : null, 
    [firestore]
  );
  const { data: activeBankAccounts, isLoading: areAccountsLoading } = useCollection<BankAccount>(bankAccountsQuery);
  const activeAccount = activeBankAccounts?.[0];

  useEffect(() => {
    if (!invoice) setPreviewUrl(null);
  }, [invoice]);

  const { uploadImage, deleteImage } = useUploadImage();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      toast({ title: 'กำลังอัปโหลดสลิป...', description: 'กรุณารอสักครู่' });
      try {
          const url = await uploadImage(file, 'slips');
          setPreviewUrl(url);
          toast({ title: 'อัปโหลดสำเร็จ' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'อัปโหลดล้มเหลว', description: 'อัปโหลดสลิปไม่สำเร็จ' });
      }
    }
  };

  const handleUpload = () => {
    if (!previewUrl || !firestore || !invoice) return;
    startTransition(async () => {
      try {
        await updateDoc(doc(firestore, 'feeInvoices', invoice.id), {
          status: 'PROCESSING',
          paymentSlipUrl: previewUrl,
          updatedAt: serverTimestamp()
        });
        toast({ title: 'ส่งสลิปเรียบร้อย', description: 'เจ้าหน้าที่กำลังตรวจสอบข้อมูลการโอนเงินของคุณ' });
        onClose();
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'ล้มเหลว', description: error.message });
      }
    });
  };

  return (
    <CustomDialog isOpen={!!invoice} onClose={onClose} title="แจ้งชำระค่าธรรมเนียม" size="lg">
      <div className={cn("space-y-6 pt-2", !invoice && "hidden")}>
        {invoice && (
          <>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">ยอดเงินที่ต้องชำระ</p>
                <p className="text-2xl font-bold text-primary">฿{invoice.amount.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{invoice.billingPeriod}</p>
                <p className="text-xs text-muted-foreground">{invoice.branchName}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2"><AlertCircle className="h-4 w-4" /> ข้อมูลบัญชีธนาคาร</h3>
              {areAccountsLoading ? <Skeleton className="h-20 w-full" /> : activeAccount ? (
                <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ธนาคาร</span>
                    <span className="font-medium">{activeAccount.bankName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ชื่อบัญชี</span>
                    <span className="font-medium">{activeAccount.accountName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">เลขที่บัญชี</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg">{activeAccount.accountNumber}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        navigator.clipboard.writeText(activeAccount.accountNumber);
                        toast({ title: 'คัดลอกเลขบัญชีแล้ว' });
                      }}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-destructive">ขออภัย ยังไม่ได้ตั้งค่าบัญชีธนาคารในระบบ</p>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold">อัปโหลดหลักฐานการโอนเงิน</h3>
              {!previewUrl ? (
                <div className="space-y-2">
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/30">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">คลิกเพื่อเลือกรูปสลิป</p>
                    <p className="text-[10px] text-muted-foreground mt-1">ไฟล์ JPG, PNG ไม่เกิน 700KB</p>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                  </label>
                  <div className="text-center">
                    <a 
                      href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground underline hover:text-primary transition-colors"
                    >
                      อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
                    </a>
                  </div>
                </div>
              ) : (
                <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden border bg-black/5 max-w-[240px] mx-auto">
                  <Image src={previewUrl} alt="Preview" fill className="object-contain" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg" 
                    onClick={() => { if (previewUrl) deleteImage(previewUrl); setPreviewUrl(null); }}
                  >
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={isPending}>ยกเลิก</Button>
              <Button className="flex-1 sm:flex-none" onClick={handleUpload} disabled={isPending || !previewUrl}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                ยืนยันการแจ้งชำระเงิน
              </Button>
            </div>
          </>
        )}
      </div>
    </CustomDialog>
  );
}
