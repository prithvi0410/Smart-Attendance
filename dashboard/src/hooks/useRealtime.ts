import { useEffect } from 'react';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const useRealtime = (callback: (record: any) => void) => {
  useEffect(() => {
    let channel: RealtimeChannel;

    const subscribe = async () => {
      channel = supabase
        .channel('public:attendance_records')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'attendance_records',
          },
          (payload) => {
            console.log("Realtime event received:", payload);
            callback(payload.new);
          }
        )
        .subscribe();
    };

    subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [callback]);
};
