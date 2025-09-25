import customSonner from '@/components/CustomSonner';
import { rpc } from '@/lib/rpc';
import type { DbUserSettings } from '@server/db/app/app-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

type SettingsData = DbUserSettings | null;

export default function useSettings() {
  const queryClient = useQueryClient();
  const {
    data: settingsData,
    isLoading: isLoadingSettings,
    refetch: refetchSettings,
    error: errorSettings,
  } = useQuery<SettingsData>({
    queryKey: ['settings'],
    staleTime: 10000,
    retry: 10,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async () => {
      const resp = await rpc.api.settings.$get();
      const payload = await resp.json();
      return payload.data ?? null;
    },
  });

  const { mutateAsync: persistSettings, isPending: isSavingSettings } =
    useMutation<DbUserSettings, Error, DbUserSettings>({
      mutationKey: ['settings', 'saveSettings'],
      mutationFn: async (payload) => {
        const resp = await (
          await rpc.api.settings.$post({ json: payload })
        ).json();
        if (!resp.success || !resp.data) {
          throw new Error(resp.message ?? 'Failed to save settings');
        }

        return resp.data;
      },
      onSuccess: (updatedSettings) => {
        queryClient.setQueryData<SettingsData>(['settings'], updatedSettings);
        customSonner({
          text: 'Settings saved successfully',
        });
      },
      onError: (error) => {
        const fallback = 'Failed to save settings';
        const message = error instanceof Error ? error.message : String(error);
        const text = message.startsWith(fallback)
          ? message
          : `${fallback}: ${message}`;

        customSonner({
          variant: 'error',
          text,
        });
      },
    });

  const saveSettings = useCallback(
    async (payload: DbUserSettings) => {
      return await persistSettings(payload);
    },
    [persistSettings]
  );

  return {
    settingsData,
    isLoadingSettings,
    refetchSettings,
    errorSettings,
    saveSettings,
    isSavingSettings,
  };
}
