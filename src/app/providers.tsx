'use client';

import { AuthProvider } from '@/contexts/auth-context';
import { CartProvider } from '@/contexts/cart-context';
import { FirebaseClientProvider } from '@/firebase';
import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { PaymentBlocker } from '@/components/shared/payment-blocker';
import { AnnouncementModal } from '@/components/shared/announcement-modal';
import { MandatoryQuizModal } from '@/components/shared/mandatory-quiz-modal';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <FirebaseClientProvider>
        <AuthProvider>
          <PaymentBlocker>
            <CartProvider>
              {children}
              <AnnouncementModal />
              <MandatoryQuizModal />
            </CartProvider>
          </PaymentBlocker>
        </AuthProvider>
      </FirebaseClientProvider>
    </ThemeProvider>
  );
}
