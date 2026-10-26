import { supabase } from './supabase';
import type { Device } from '../types/database';

export const getDevices = async () => {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('is_active', true)
    .order('device_name', { ascending: true });
    
  if (error) throw error;
  return data as Device[];
};

import type { DeviceWifiNetwork } from '../types/database';

export const getDeviceWifiNetworks = async (deviceId: string) => {
  const { data, error } = await supabase
    .from('device_wifi_networks')
    .select('*')
    .eq('device_id', deviceId)
    .order('priority', { ascending: true });
    
  if (error) throw error;
  return data as DeviceWifiNetwork[];
};

export const provisionDeviceWifi = async (deviceId: string, ssid: string, password: string, priority: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-wifi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      device_id: deviceId,
      ssid,
      password,
      priority
    })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to provision Wi-Fi');
  }

  return data; // contains command_id and network_id
};

export const deleteDeviceWifiNetwork = async (networkId: string) => {
  const { error } = await supabase
    .from('device_wifi_networks')
    .delete()
    .eq('id', networkId);
    
  if (error) throw error;
  return true;
};

export const setDeviceMode = async (deviceId: string, mode: 'attendance' | 'registration') => {
  const { error } = await supabase
    .from('devices')
    .update({ current_mode: mode })
    .eq('id', deviceId);
  if (error) throw error;
};

export const switchDeviceWifi = async (deviceId: string, networkId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/switch-wifi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ device_id: deviceId, network_id: networkId })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to switch Wi-Fi');
  }
  return data;
};
