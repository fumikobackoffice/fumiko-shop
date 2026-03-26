'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { distributeGlobalPoints, getUsers } from '@/app/actions';
import { AppUser, UserProfile } from '@/lib/types';
import { 
  Users, 
  Ticket, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Star,
  Info,
  PlusCircle,
  MinusCircle,
  Search,
  X,
  UserCheck,
  UserX
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const globalPointsSchema = z.object({
  type: z.enum(['add', 'deduct']),
  amount: z.coerce
    .number({ invalid_type_error: 'กรุณากรอกตัวเลข' })
    .int('ต้องเป็นจำนวนเต็ม')
    .min(1, 'ต้องมียอดอย่างน้อย 1 คะแนน'),
  reason: z.string().min(5, 'กรุณาระบุเหตุผลให้ชัดเจน (อย่างน้อย 5 ตัวอักษร)'),
});

type FormValues = z.infer<typeof globalPointsSchema>;

export function GlobalPointsManager({ adminUser }: { adminUser: AppUser }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  // States for User List and Exceptions
  const [allSellers, setAllSellers] = useState<UserProfile[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [userSearchTerm, setUserSearchTerm] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(globalPointsSchema),
    defaultValues: { 
      type: 'add',
      amount: 0, 
      reason: '' 
    },
  });

  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const users = await getUsers();
        const activeSellers = users.filter(u => u.role === 'seller' && u.status === 'active');
        setAllSellers(activeSellers);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchSellers();
  }, []);

  const filteredSellers = useMemo(() => {
    if (!userSearchTerm.trim()) return allSellers;
    const term = userSearchTerm.toLowerCase().trim();
    return allSellers.filter(u => 
      u.name.toLowerCase().includes(term) || 
      u.email.toLowerCase().includes(term)
    );
  }, [allSellers, userSearchTerm]);

  const targetCount = allSellers.length - excludedIds.size;

  const toggleUserSelection = (userId: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => setExcludedIds(new Set());
  const deselectAll = () => setExcludedIds(new Set(allSellers.map(u => u.id)));

  const handleOpenConfirm = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;
    
    if (targetCount === 0) {
      toast({ variant: 'destructive', title: 'ไม่มีผู้รับ', description: 'กรุณาเลือกผู้ใช้อย่างน้อย 1 ราย' });
      return;
    }
    
    setIsConfirmOpen(true);
  };

  const handleExecute = () => {
    const values = form.getValues();
    setIsConfirmOpen(false);
    
    const finalAmount = values.type === 'add' ? values.amount : -values.amount;

    startTransition(async () => {
      try {
        const result = await distributeGlobalPoints(
          finalAmount, 
          values.reason, 
          adminUser.id, 
          adminUser.name,
          Array.from(excludedIds)
        );
        
        toast({ 
          title: 'ดำเนินการสำเร็จ', 
          description: `ดำเนินการกับผู้ใช้งานจำนวน ${result.count} ราย เรียบร้อยแล้ว` 
        });
        
        form.reset({
          type: 'add',
          amount: 0,
          reason: ''
        });
        setExcludedIds(new Set());
      } catch (error: any) {
        toast({ 
          variant: 'destructive', 
          title: 'เกิดข้อผิดพลาด', 
          description: error.message 
        });
      }
    });
  };

  const type = form.watch('type');
  const amount = form.watch('amount') || 0;
  const totalImpact = targetCount * amount;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="bg-primary/5 rounded-t-lg border-b border-primary/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full text-primary">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl">กิจกรรมคะแนนรวม (Global Points Action)</CardTitle>
              <CardDescription>ปรับปรุงคะแนนสะสมให้กลุ่มเป้าหมายในระบบพร้อมกัน</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="p-4 bg-muted/30 rounded-xl border flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">เป้าหมายที่จะได้รับ</p>
                {isLoadingUsers ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <div className="flex items-baseline gap-1">
                    <p className="text-xl font-bold">{targetCount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">/ {allSellers.length} บัญชี</p>
                  </div>
                )}
              </div>
            </div>
            <div className={cn(
              "p-4 rounded-xl border flex items-center gap-4 transition-colors",
              type === 'add' ? "bg-primary/5 border-primary/10" : "bg-destructive/5 border-destructive/10"
            )}>
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center",
                type === 'add' ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              )}>
                <Ticket className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                  ยอด{type === 'add' ? 'แจก' : 'หัก'}รวมทั้งสิ้น
                </p>
                <p className={cn("text-xl font-bold", type === 'add' ? "text-primary" : "text-destructive")}>
                  {type === 'deduct' && '-'}{totalImpact.toLocaleString()} <span className="text-xs font-normal">คะแนน</span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Left: Input Form */}
            <Form {...form}>
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="font-bold">1. ประเภทการดำเนินการ</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="grid grid-cols-2 gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="add" id="type-add" className="peer sr-only" />
                            <Label
                              htmlFor="type-add"
                              className="flex flex-1 items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                            >
                              <PlusCircle className="mr-2 h-4 w-4 text-primary" />
                              <span className="font-bold">เพิ่ม (แจก)</span>
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="deduct" id="type-deduct" className="peer sr-only" />
                            <Label
                              htmlFor="type-deduct"
                              className="flex flex-1 items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-destructive peer-data-[state=checked]:bg-destructive/5 cursor-pointer transition-all"
                            >
                              <MinusCircle className="mr-2 h-4 w-4 text-destructive" />
                              <span className="font-bold">หัก (ริบ)</span>
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">2. จำนวนคะแนน (ต่อคน)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Ticket className={cn(
                            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4",
                            type === 'add' ? "text-primary" : "text-destructive"
                          )} />
                          <Input 
                            type="text"
                            inputMode="numeric"
                            placeholder="กรอกจำนวนคะแนน" 
                            className={cn(
                              "pl-9 h-12 text-lg font-bold",
                              type === 'deduct' && "border-destructive focus-visible:ring-destructive text-destructive"
                            )} 
                            {...field}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                              field.onChange(val === '' ? '' : Number(val));
                            }}
                            value={field.value === 0 ? '' : field.value}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">3. เหตุผลการดำเนินการ</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="เช่น โบนัสปีใหม่, ปรับปรุงคะแนน..." 
                          className="h-12" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">ข้อความนี้จะปรากฏในสมุดคะแนนของลูกค้า</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Form>

            {/* Right: User List with Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold">4. รายชื่อผู้รับ (คัดออกบางคนได้)</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-[10px] h-7 uppercase font-bold text-primary hover:text-primary">
                    <UserCheck className="mr-1 h-3 w-3" /> เลือกทั้งหมด
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="text-[10px] h-7 uppercase font-bold text-destructive hover:text-destructive">
                    <UserX className="mr-1 h-3 w-3" /> ไม่เลือกเลย
                  </Button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="ค้นหาชื่อหรืออีเมลเพื่อคัดออก..." 
                  className="pl-8 h-9 text-xs bg-muted/20"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                />
                {userSearchTerm && (
                  <button onClick={() => setUserSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full">
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              <Card className="border shadow-inner">
                <ScrollArea className="h-[300px]">
                  {isLoadingUsers ? (
                    <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> กำลังโหลดรายชื่อ...</div>
                  ) : filteredSellers.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground italic">ไม่พบรายชื่อที่ค้นหา</div>
                  ) : (
                    <div className="divide-y">
                      {filteredSellers.map((seller) => {
                        const isSelected = !excludedIds.has(seller.id);
                        return (
                          <div 
                            key={seller.id} 
                            className={cn(
                              "flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors",
                              !isSelected && "bg-muted/20 opacity-60"
                            )}
                            onClick={() => toggleUserSelection(seller.id)}
                          >
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleUserSelection(seller.id)}
                              className={cn(isSelected ? "border-primary data-[state=checked]:bg-primary" : "")}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold truncate">{seller.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{seller.email}</p>
                            </div>
                            {isSelected ? (
                              <Badge variant="success" className="text-[8px] h-4 px-1 leading-none uppercase">รวม</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[8px] h-4 px-1 leading-none uppercase text-muted-foreground">ยกเว้น</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </Card>
              <p className="text-[10px] text-muted-foreground text-center">
                กำลังเลือก <span className="font-bold text-foreground">{targetCount}</span> ราย จากทั้งหมด {allSellers.length} ราย
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t p-6">
          <Button 
            className={cn(
              "w-full h-12 text-base font-bold shadow-md",
              type === 'deduct' ? "bg-destructive hover:bg-destructive/90" : ""
            )}
            onClick={handleOpenConfirm}
            disabled={isPending || isLoadingUsers || targetCount === 0}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : type === 'add' ? (
              <PlusCircle className="mr-2 h-5 w-5" />
            ) : (
              <MinusCircle className="mr-2 h-5 w-5" />
            )}
            ดำเนินการ{type === 'add' ? 'แจก' : 'หัก'}คะแนน {targetCount} ราย
          </Button>
        </CardFooter>
      </Card>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900">
        <Info className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold">ข้อมูลสำคัญ:</p>
          <p>ระบบจะทำการประมวลผลเป็นชุดละ 250 รายการเพื่อความเสถียร หากแจกคนจำนวนมากอาจใช้เวลาครู่หนึ่งครับ</p>
        </div>
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className={cn("h-5 w-5", type === 'add' ? "text-primary" : "text-destructive")} />
              ยืนยันการ{type === 'add' ? 'แจก' : 'หัก'}คะแนน?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <div className={cn(
                "p-4 rounded-lg space-y-2 border",
                type === 'add' ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"
              )}>
                <p className="text-foreground">
                  คุณกำลังจะ<strong className={type === 'add' ? "text-primary" : "text-destructive"}>{type === 'add' ? 'เพิ่ม' : 'หัก'}คะแนน {amount} คะแนน</strong>
                </p>
                <p className="text-foreground">ให้ผู้ใช้งานที่เลือกจำนวน <strong className="text-foreground">{targetCount} บัญชี</strong></p>
                <p className="text-foreground">เหตุผล: <span className="italic">"{form.getValues('reason')}"</span></p>
              </div>
              <p className="text-sm font-bold text-destructive">*** การดำเนินการนี้ไม่สามารถยกเลิกได้เมื่อเริ่มแล้ว ***</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ย้อนกลับ</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleExecute(); }}
              className={cn(
                "font-bold text-white",
                type === 'add' ? "bg-primary hover:bg-primary/90" : "bg-destructive hover:bg-destructive/90"
              )}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ยืนยันดำเนินการ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
