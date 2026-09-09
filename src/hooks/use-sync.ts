/**
 * src/hooks/use-sync.ts
 *
 * Client-side hook for cloud synchronization state and manual trigger.
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  status: 'synced' | 'syncing' | 'offline' | 'error' | 'never';
  error: string | null;
  cloudConfigured: boolean;
  cloudUrlHost: string;
}

export function useSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Automatically trigger sync when network reconnects
      syncMutation.mutate();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { data: syncStatus, refetch } = useQuery<SyncStatus>({
    queryKey: queryKeys.sync.status,
    queryFn: async () => {
      const res = await fetch('/api/sync');
      if (!res.ok) throw new Error('Failed to fetch sync status');
      return res.json();
    },
    refetchInterval: 45000, // Poll every 45s
    refetchIntervalInBackground: false,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to synchronize with cloud database');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.dashboard });
      
      const totalChanges = (data.pushedCount || 0) + (data.pulledCount || 0);
      if (totalChanges > 0) {
        toast.success(`Cloud sync completed (${data.pushedCount} uploaded, ${data.pulledCount} downloaded)`);
      } else {
        toast.success('Cloud sync complete — all data is up to date.');
      }
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
      toast.error(err.message || 'Sync failed. Local data remains safe.');
    },
  });

  const effectiveStatus = !isOnline
    ? 'offline'
    : syncMutation.isPending
    ? 'syncing'
    : (syncStatus?.status ?? 'never');

  return {
    syncStatus,
    isOnline,
    status: effectiveStatus,
    isSyncing: syncMutation.isPending || syncStatus?.isSyncing,
    lastSyncedAt: syncStatus?.lastSyncedAt,
    cloudConfigured: syncStatus?.cloudConfigured ?? false,
    cloudUrlHost: syncStatus?.cloudUrlHost ?? 'Neon Cloud',
    syncNow: () => syncMutation.mutate(),
    refetchStatus: refetch,
  };
}
