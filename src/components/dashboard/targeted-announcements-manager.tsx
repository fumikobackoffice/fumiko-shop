'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { TargetedAnnouncement } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Search, Trash2, Edit, Megaphone, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TargetedAnnouncementDialog } from './targeted-announcement-dialog';

export function TargetedAnnouncementsManager() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<TargetedAnnouncement | null>(null);

  const announcementsRef = useMemoFirebase(() => firestore ? collection(firestore, 'targeted_announcements') : null, [firestore]);
  const { data: announcements, isLoading } = useCollection<TargetedAnnouncement>(announcementsRef);

  const handleCreate = () => {
    setEditingAnnouncement(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (announcement: TargetedAnnouncement) => {
    setEditingAnnouncement(announcement);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!firestore || !confirm("คุณแน่ใจหรือไม่ว่าต้องการลบประกาศฉบับนี้? (การลบจะทำให้ลูกค้าทุกคนไม่พบเนื้อหานี้อีก)")) return;
    try {
      await deleteDoc(doc(firestore, 'targeted_announcements', id));
      toast({ title: 'ลบสำเร็จ', description: 'ประกาศถูกลบออกจากระบบแล้ว' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'targeted_announcements', id), { active: !currentStatus });
      toast({ title: !currentStatus ? 'เปิดใช้งานแล้ว' : 'ปิดการใช้งานแล้ว' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    }
  };

  const getTargetLabel = (ann: TargetedAnnouncement) => {
    switch (ann.targetType) {
      case 'ALL_SELLERS': return <Badge className="bg-blue-500 hover:bg-blue-600">ทุกสาขา</Badge>;
      case 'BY_PROVINCE': return <Badge className="bg-purple-500 hover:bg-purple-600">ตามจังหวัด ({ann.targetProvinces?.length || 0})</Badge>;
      case 'BY_REGION': return <Badge className="bg-orange-500 hover:bg-orange-600">ตามภูมิภาค ({ann.targetRegions?.length || 0})</Badge>;
      case 'SPECIFIC_USERS': return <Badge className="bg-rose-500 hover:bg-rose-600">เจาะจงบุคคล ({ann.targetUserIds?.length || 0})</Badge>;
      default: return <Badge variant="outline">ไม่ทราบ</Badge>;
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-headline flex items-center gap-2">
            ประกาศเฉพาะกลุ่มเป้าหมาย
          </h3>
          <p className="text-sm text-muted-foreground">ส่งข้อความพร้อมบังคับให้ลูกค้ากดยอมรับ โดยสามารถเลือกกลุ่มเป้าหมายได้</p>
        </div>
        <Button onClick={handleCreate} className="gap-2 font-bold shadow-md">
          <PlusCircle className="h-4 w-4" /> สร้างประกาศใหม่
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {(announcements || []).map(ann => (
          <Card key={ann.id} className={`shadow-sm transition-all hover:shadow-md ${!ann.active ? 'opacity-70 grayscale-[50%]' : 'border-primary/20'}`}>
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex justify-between items-start">
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    {ann.active ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    <CardTitle className="text-base line-clamp-1">{ann.title}</CardTitle>
                  </div>
                  {getTargetLabel(ann)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                {ann.content || <span className="italic text-muted-foreground/50">ไม่มีข้อความบรรยาย (อาจเป็นรูปภาพเท่านั้น)</span>}
              </div>
              
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => toggleActive(ann.id, ann.active)} className="flex-1 text-xs">
                  {ann.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </Button>
                <Button variant="secondary" size="icon" onClick={() => handleEdit(ann)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="destructive" size="icon" onClick={() => handleDelete(ann.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {(!announcements || announcements.length === 0) && (
          <div className="col-span-full py-12 text-center rounded-xl border border-dashed border-primary/20 bg-primary/5">
            <Megaphone className="h-12 w-12 text-primary/30 mx-auto mb-3" />
            <h4 className="text-lg font-bold text-foreground">ยังไม่มีประกาศเฉพาะกลุ่ม</h4>
            <p className="text-sm text-muted-foreground mt-1 mb-4">คลิกปุ่ม "สร้างประกาศใหม่" เพื่อเริ่มต้นสื่อสารกับสาขา</p>
            <Button variant="outline" onClick={handleCreate}>สร้างประกาศใหม่</Button>
          </div>
        )}
      </div>

      {isDialogOpen && (
        <TargetedAnnouncementDialog 
          open={isDialogOpen} 
          onOpenChange={setIsDialogOpen} 
          announcement={editingAnnouncement}
        />
      )}
    </div>
  );
}
