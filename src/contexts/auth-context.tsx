'use client';

import { createContext, ReactNode, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UserProfile } from '@/lib/types';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { v4 as uuidv4 } from 'uuid';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (name: string, email: string, password: string, role: 'seller' | 'admin' | 'super_admin') => Promise<{ success: boolean; message: string; }>;
  // Impersonation state
  impersonatedUser: UserProfile | null;
  startImpersonation: (user: UserProfile) => void;
  stopImpersonation: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionTrigger, setSessionTrigger] = useState(0); 
  const [impersonatedUser, setImpersonatedUser] = useState<UserProfile | null>(null);
  const firestore = useFirestore();
  const router = useRouter();
  const isFirstLoad = useRef(true);

  const logout = useCallback(() => {
    setUser(null);
    setImpersonatedUser(null);
    localStorage.removeItem('fumiko-user-id');
    sessionStorage.removeItem('impersonated-user');
    setLoading(false);
    router.push('/login');
  }, [router]);

  // Handle Impersonation initialization
  useEffect(() => {
    const stored = sessionStorage.getItem('impersonated-user');
    if (stored) {
      try {
        setImpersonatedUser(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse impersonated user", e);
      }
    }
  }, []);

  const startImpersonation = useCallback((u: UserProfile) => {
    setImpersonatedUser(u);
    sessionStorage.setItem('impersonated-user', JSON.stringify(u));
    router.push('/shop');
  }, [router]);

  const stopImpersonation = useCallback(() => {
    setImpersonatedUser(null);
    sessionStorage.removeItem('impersonated-user');
    router.push('/dashboard/orders');
  }, [router]);

  // Unified real-time sync and initialization
  useEffect(() => {
    if (!firestore) return;

    const storedUserId = localStorage.getItem('fumiko-user-id');
    
    if (!storedUserId) {
      setUser(null);
      setLoading(false);
      isFirstLoad.current = false;
      return;
    }

    if (isFirstLoad.current) {
        setLoading(true);
    }

    const userDocRef = doc(firestore, 'users', storedUserId);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as UserProfile;
        
        if (userData.status === 'archived') {
          logout();
        } else {
          // Only update if data has actually changed to prevent render loops
          setUser(prev => {
            const nextData = { ...userData, pointsBalance: userData.pointsBalance || 0 };
            if (JSON.stringify(prev) === JSON.stringify(nextData)) return prev;
            return nextData;
          });
        }
      } else {
        logout();
      }
      
      setLoading(false);
      isFirstLoad.current = false;
    }, (error) => {
      console.error("Auth real-time listener error:", error);
      setLoading(false);
      isFirstLoad.current = false;
    });

    return () => unsubscribe();
  }, [firestore, logout, sessionTrigger]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!firestore) return false;
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('email', '==', email));
    
    try {
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return false;

      const userData = querySnapshot.docs[0].data() as UserProfile;

      if (userData.password === password) {
        if (userData.status === 'archived') return false;
        
        localStorage.setItem('fumiko-user-id', userData.id);
        setSessionTrigger(prev => prev + 1);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  }, [firestore]);

  const register = useCallback(async (name: string, email: string, password: string, role: 'seller' | 'admin' | 'super_admin'): Promise<{ success: boolean; message: string; }> => {
    if (!firestore) return { success: false, message: 'ฐานข้อมูลไม่พร้อมใช้งาน' };

    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('email', '==', email));
    
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return { success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' };
    }
    
    const userId = uuidv4();
    const [firstName, ...lastNameParts] = name.split(' ');
    const lastName = lastNameParts.join(' ');
    
    const newUserProfile: UserProfile = {
      id: userId,
      name,
      firstName,
      lastName,
      email,
      password,
      role,
      status: 'active',
      pointsBalance: 0,
      createdAt: serverTimestamp(),
    };
    
    try {
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, 'users', userId), newUserProfile);
        batch.set(doc(firestore, 'user_roles', userId), { role: role });
        await batch.commit();

        localStorage.setItem('fumiko-user-id', userId);
        setSessionTrigger(prev => prev + 1);
        return { success: true, message: 'ลงทะเบียนสำเร็จ' };
    } catch(error) {
        console.error("Registration failed:", error);
        return { success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียน' };
    }
  }, [firestore]);

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({ 
    user, 
    loading, 
    login, 
    logout, 
    register,
    impersonatedUser,
    startImpersonation,
    stopImpersonation
  }), [user, loading, login, logout, register, impersonatedUser, startImpersonation, stopImpersonation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
