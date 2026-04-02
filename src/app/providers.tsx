'use client';

import { AuthProvider } from '@/contexts/auth-context';
import { CartProvider } from '@/contexts/cart-context';
import { FirebaseClientProvider } from '@/firebase';
import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { PaymentBlocker } from '@/components/shared/payment-blocker';
import { AnnouncementModal } from '@/components/shared/announcement-modal';
import { MandatoryQuizModal } from '@/components/shared/mandatory-quiz-modal';
import { MaintenanceGuard } from '@/components/shared/maintenance-guard';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <FirebaseClientProvider>
        <AuthProvider>
          <MaintenanceGuard>
            <PaymentBlocker>
              <CartProvider>
                {children}
                <AnnouncementModal />
                <MandatoryQuizModal />
              </CartProvider>
            </PaymentBlocker>
          </MaintenanceGuard>
        </AuthProvider>
      </FirebaseClientProvider>
    </ThemeProvider>
  );
}
