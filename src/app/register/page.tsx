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
import { useEffect } from 'react';

const formSchema = z.object({
  name: z.string().min(2, { message: 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร' }),
  email: z.string().email({ message: 'ที่อยู่อีเมลไม่ถูกต้อง' }),
  password: z.string().min(6, { message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }),
});

function RegisterForm() {
  const { register, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (!authLoading && user) {
      toast({ title: 'ลงทะเบียนสำเร็จ', description: `ยินดีต้อนรับ, ${user.name}!` });
      router.push('/');
    }
  }, [user, authLoading, router, toast]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const { success, message } = await register(values.name, values.email, values.password, 'super_admin');
    if (!success) {
      form.setError('email', { type: 'manual', message });
      toast({
        variant: 'destructive',
        title: 'การลงทะเบียนล้มเหลว',
        description: message,
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ชื่อเต็ม <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="สมชาย ใจดี" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <Button type="submit" className="w-full" disabled={authLoading || form.formState.isSubmitting}>
          สร้างบัญชี
        </Button>
      </form>
    </Form>
  );
}


export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mx-auto mb-8 flex justify-center">
            <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">สร้างบัญชีผู้ดูแลระบบระดับสูงสุด</CardTitle>
            <CardDescription>สร้างบัญชี Super Admin เริ่มต้นสำหรับ Fumiko Shop</CardDescription>
          </CardHeader>
          <CardContent>
             <RegisterForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
