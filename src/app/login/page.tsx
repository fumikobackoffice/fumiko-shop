'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/shared/logo';
import { useEffect, useState } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  email: z.string().email({ message: 'ที่อยู่อีเมลไม่ถูกต้อง' }),
  password: z.string().min(1, { message: 'กรุณากรอกรหัสผ่าน' }),
});

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();

  const [showSignUp, setShowSignUp] = useState(false);
  const [checkingSuperAdmin, setCheckingSuperAdmin] = useState(true);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (!authLoading && user) {
       toast({ title: 'เข้าสู่ระบบสำเร็จ', description: `ยินดีต้อนรับกลับ, ${user.name}!` });
       router.push('/');
    }
  }, [user, authLoading, router, toast]);

  useEffect(() => {
    const checkSuperAdmin = async () => {
      if (!firestore) {
        return;
      };
      try {
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, where('role', '==', 'super_admin'), limit(1));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setShowSignUp(true);
        }
      } catch (error) {
        console.error("Error checking for super admin:", error);
      } finally {
        setCheckingSuperAdmin(false);
      }
    };
    checkSuperAdmin();
  }, [firestore]);

  const handlePinSubmit = () => {
    if (pin === '198691') {
      setIsPinDialogOpen(false);
      router.push('/register');
    } else {
      setPinError('PIN ไม่ถูกต้อง');
      setPin('');
    }
  };

  const openPinDialog = () => {
    setPin('');
    setPinError('');
    setIsPinDialogOpen(true);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const success = await login(values.email, values.password);
    if (!success) {
      form.setError('password', {
        type: 'manual',
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
      toast({
        variant: 'destructive',
        title: 'เข้าสู่ระบบล้มเหลว',
        description: 'กรุณาตรวจสอบอีเมลและรหัสผ่านของคุณ',
      });
    }
  }

  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="mx-auto mb-8 flex justify-center">
              <Logo />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="font-headline text-2xl">ยินดีต้อนรับกลับ</CardTitle>
              <CardDescription>ป้อนข้อมูลประจำตัวของคุณเพื่อเข้าถึงบัญชีของคุณ</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>อีเมล <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="name@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>รหัสผ่าน <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                  </Button>
                </form>
              </Form>
              <div className="mt-4 text-center text-sm h-5">
                {checkingSuperAdmin ? (
                   <div className="flex justify-center items-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : showSignUp ? (
                   <>
                    ยังไม่มีบัญชี?{' '}
                    <button onClick={openPinDialog} className="underline font-medium hover:text-primary">
                      สร้างบัญชี
                    </button>
                   </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <CustomDialog isOpen={isPinDialogOpen} onClose={() => setIsPinDialogOpen(false)} title="ป้อน PIN เพื่อสร้างบัญชี Super Admin">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                เพื่อความปลอดภัย กรุณาป้อน PIN เพื่อดำเนินการต่อ
            </p>
            <Input 
                type="password"
                value={pin}
                onChange={(e) => {
                    setPin(e.target.value);
                    if (pinError) setPinError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                placeholder="••••••"
            />
            {pinError && <p className="text-sm font-medium text-destructive">{pinError}</p>}
          </div>
           <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
              <Button variant="outline" onClick={() => setIsPinDialogOpen(false)}>ยกเลิก</Button>
              <Button onClick={handlePinSubmit}>ยืนยัน</Button>
          </div>
      </CustomDialog>
    </>
  );
}
