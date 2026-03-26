
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, Timestamp, QueryConstraint } from 'firebase/firestore';

/**
 * Global store to persist cached data across page navigations within the session.
 */
const globalCacheStore: Record<string, any> = {};
const globalTimeStore: Record<string, number> = {};

export interface SmartFetchOptions<T> {
  /** Unique key for the cache store */
  key: string;
  /** Async function to fetch data */
  fetcher: () => Promise<T>;
  /** Key for storing auto-refresh preference in localStorage */
  localStorageKey: string;
  /** Optional Firestore path to watch for real-time badge counting */
  watchPath?: string;
  /** Optional field to compare for "newness" (default: updatedAt) */
  watchField?: string;
  /** Optional additional filters for the watcher */
  watchFilters?: QueryConstraint[];
  /** Flag to enable or disable the hook logic entirely */
  enabled?: boolean;
}

/**
 * A centralized hook to manage data fetching with session caching and real-time update badges.
 */
export function useSmartFetch<T>({
  key,
  fetcher,
  localStorageKey,
  watchPath,
  watchField = 'updatedAt',
  watchFilters = [],
  enabled = true,
}: SmartFetchOptions<T>) {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [data, setData] = useState<T | null>(globalCacheStore[key] || null);
  const [isLoading, setIsLoading] = useState(enabled && !globalCacheStore[key]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuto, setIsAuto] = useState(false);
  
  // State for Real-time Badge
  const [badgeCount, setBadgeCount] = useState(0);
  const [lastFetchedTime, setLastFetchedTime] = useState<number>(globalTimeStore[key] || Date.now());
  
  const hasInitializedRef = useRef(false);

  // 1. Initialize Auto-Refresh state
  useEffect(() => {
    if (!enabled) return;
    const saved = localStorage.getItem(localStorageKey);
    setIsAuto(saved === 'true');
  }, [localStorageKey, enabled]);

  const handleSetAuto = (value: boolean) => {
    setIsAuto(value);
    localStorage.setItem(localStorageKey, String(value));
  };

  /**
   * The core fetching logic.
   */
  const performFetch = useCallback(async (manual = false, silent = false) => {
    if (!enabled) return;
    
    if (!manual && globalCacheStore[key] && !isAuto) {
      setData(globalCacheStore[key]);
      setIsLoading(false);
      return;
    }

    if (manual) setIsRefreshing(true);
    else if (!manual) setIsLoading(true);

    try {
      const result = await fetcher();
      const now = Date.now();
      
      globalCacheStore[key] = result;
      globalTimeStore[key] = now;
      
      setData(result);
      setLastFetchedTime(now);
      setBadgeCount(0); // Reset badge on full refresh

      if (manual && !silent) {
        toast({ title: 'อัปเดตข้อมูลล่าสุดแล้ว' });
      }
    } catch (error: any) {
      if (!silent) {
        toast({ 
          variant: 'destructive', 
          title: 'เกิดข้อผิดพลาด', 
          description: error.message || 'ไม่สามารถโหลดข้อมูลได้' 
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [key, fetcher, isAuto, toast, enabled]);

  // 2. Trigger on Entry logic
  useEffect(() => {
    if (enabled && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const saved = localStorage.getItem(localStorageKey);
      const shouldBypassCache = saved === 'true';
      performFetch(shouldBypassCache, true);
    }
  }, [performFetch, localStorageKey, enabled]);

  // 3. Real-time Observer for Badge Count
  // We stringify the filters to prevent infinite re-renders if the filters array is defined inline
  const filtersKey = JSON.stringify(watchFilters.map(f => f.toString()));

  useEffect(() => {
    if (!enabled || !watchPath || !firestore || isRefreshing || isLoading) return;

    // Convert lastFetchedTime to Firestore Timestamp for comparison
    const lastTime = Timestamp.fromMillis(lastFetchedTime);
    
    // Query documents that were updated AFTER we last fetched the main data
    const q = query(
      collection(firestore, watchPath),
      ...watchFilters,
      where(watchField, '>', lastTime)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // The badge count is the number of "new" items
      // We check for metadata to ignore local changes that haven't been synced yet
      if (!snapshot.metadata.hasPendingWrites) {
        setBadgeCount(snapshot.docs.length);
      }
    }, (err) => {
      console.warn(`Watcher for ${watchPath} failed:`, err);
    });

    return () => unsubscribe();
  }, [watchPath, watchField, filtersKey, firestore, lastFetchedTime, isRefreshing, isLoading, enabled]);

  return {
    data,
    isLoading,
    isRefreshing,
    isAuto,
    badgeCount,
    setAuto: handleSetAuto,
    refresh: (silent = false) => performFetch(true, silent),
  };
}

/**
 * Utility to clear a specific cache key from anywhere.
 */
export const clearGlobalCache = (key: string) => {
  delete globalCacheStore[key];
  delete globalTimeStore[key];
};
