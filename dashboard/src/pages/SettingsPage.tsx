import { useState, useEffect, useCallback } from 'react';
import { Wifi, Server, Shield, Info, Plus, Trash2, Signal, Activity, Network } from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { getDevices, getDeviceWifiNetworks, provisionDeviceWifi, deleteDeviceWifiNetwork, switchDeviceWifi } from '../services/devices';
import type { Device, DeviceWifiNetwork, DeviceCommand } from '../types/database';
import { getRelativeTime } from '../utils/formatters';
import { supabase } from '../services/supabase';

const WifiManagerModal = ({ device, isOpen, onClose }: { device: Device, isOpen: boolean, onClose: () => void }) => {
  const [networks, setNetworks] = useState<DeviceWifiNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Provisioning form state
  const [isAdding, setIsAdding] = useState(false);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [priority, setPriority] = useState(100);
  const [provisioning, setProvisioning] = useState(false);
  
  // Command tracking
  const [latestCommand, setLatestCommand] = useState<DeviceCommand | null>(null);

  const fetchNetworks = useCallback(async () => {
    try {
      const data = await getDeviceWifiNetworks(device.id);
      setNetworks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [device.id]);

  useEffect(() => {
    if (isOpen) {
      fetchNetworks();
      setLatestCommand(null);
      setIsAdding(false);
    }
  }, [isOpen, fetchNetworks]);

  // Listen to command updates for this device
  useEffect(() => {
    if (!isOpen) return;

    const channel = supabase
      .channel(`device_cmds_${device.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_commands', filter: `device_id=eq.${device.id}` },
        (payload) => {
          const newCmd = payload.new as DeviceCommand;
          setLatestCommand(newCmd);
          if (newCmd.status === 'success' || newCmd.status === 'failed') {
            fetchNetworks(); // refresh network list if command finished
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, device.id, fetchNetworks]);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setLatestCommand(null);
    try {
      await provisionDeviceWifi(device.id, ssid, password, priority);
      // We don't close the modal or exit adding mode yet, we wait for command status
      setSsid('');
      setPassword('');
      setPriority(100);
      setIsAdding(false);
    } catch (err: any) {
      alert(err.message || "Failed to start provisioning");
    } finally {
      setProvisioning(false);
    }
  };

  const handleDelete = async (networkId: string) => {
    if (confirm("Remove this Wi-Fi network?")) {
      try {
        await deleteDeviceWifiNetwork(networkId);
        fetchNetworks();
      } catch (err) {
        alert("Failed to remove network");
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Manage Wi-Fi: ${device.device_name}`}>
      <div className="space-y-6">
        
        {/* Command Status Banner */}
        {latestCommand && (
          <div className={`p-4 rounded-lg border ${
            latestCommand.status === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            latestCommand.status === 'failed' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <h4 className="font-semibold mb-1 flex items-center">
              {latestCommand.status === 'pending' && <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse" />}
              {latestCommand.status === 'success' && "Command Successful"}
              {latestCommand.status === 'failed' && "Command Failed"}
              {latestCommand.status === 'pending' && "Provisioning requested..."}
              {latestCommand.status === 'received' && "Testing new network..."}
            </h4>
            {latestCommand.error_code && <p className="text-sm">Error: {latestCommand.error_code}</p>}
          </div>
        )}

        {isAdding ? (
          <form onSubmit={handleProvision} className="space-y-4 border p-4 rounded-lg bg-gray-50">
            <h3 className="font-medium text-gray-900">Add New Wi-Fi Network</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSID</label>
              <input type="text" required value={ssid} onChange={e => setSsid(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority (lower is higher priority)</label>
              <input type="number" required value={priority} onChange={e => setPriority(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg">Cancel</button>
              <button type="submit" disabled={provisioning} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {provisioning ? 'Sending...' : 'Test & Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Saved Networks</h3>
            <button onClick={() => setIsAdding(true)} className="flex items-center text-sm px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors">
              <Plus className="w-4 h-4 mr-1" /> Add Wi-Fi
            </button>
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-4">Loading networks...</p>
          ) : networks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4 border border-dashed rounded-lg">No saved networks.</p>
          ) : (
            networks.map(net => (
              <div key={net.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white">
                <div>
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900 mr-2">{net.ssid}</span>
                    {device.current_ssid === net.ssid && <Badge variant="success">Active</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Priority: {net.priority} • Saved: {getRelativeTime(net.created_at)}</p>
                </div>
                <div className="flex items-center space-x-2">
                  {device.current_ssid !== net.ssid && (
                    <button 
                      onClick={async () => {
                        try {
                          
                          await switchDeviceWifi(device.id, net.id);
                          alert('Command sent! ESP32 will switch to ' + net.ssid);
                        } catch (e: any) {
                          alert(e.message);
                        }
                      }}
                      className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded border border-green-200 transition-colors"
                      title="Connect Now"
                    >
                      Connect
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(net.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors p-1"
                    title="Remove Network"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

export const SettingsPage = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const fetchDeviceData = useCallback(async () => {
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  }, []);

  useEffect(() => {
    fetchDeviceData();
  }, [fetchDeviceData]);

  // Listen to realtime updates for the devices table
  useEffect(() => {
    const channel = supabase
      .channel('public:devices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, (payload) => {
        fetchDeviceData();
        const updatedDevice = payload.new as Device;
        if (selectedDevice && updatedDevice.id === selectedDevice.id) {
          setSelectedDevice(updatedDevice);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDeviceData, selectedDevice]);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center mb-4">
            <Wifi className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Hardware Devices</h2>
          </div>
          
          <div className="space-y-4">
            {devices.length === 0 ? (
              <p className="text-sm text-gray-500">No devices found.</p>
            ) : (
              devices.map(device => (
                <div key={device.id} className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{device.device_name}</h3>
                      <p className="text-sm text-gray-500 flex items-center mt-1">
                        <Activity className="w-4 h-4 mr-1" /> Last seen: {device.last_seen_at ? getRelativeTime(device.last_seen_at) : 'Never'}
                      </p>
                    </div>
                    <Badge variant={device.wifi_status === 'online' ? 'success' : device.wifi_status === 'provisioning' ? 'info' : 'danger'}>
                      {device.wifi_status?.toUpperCase() || 'OFFLINE'}
                    </Badge>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 text-sm">
                    <div>
                      <span className="block text-gray-500 mb-1">Current SSID</span>
                      <span className="font-medium text-gray-900">{device.current_ssid || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-gray-500 mb-1">IP Address</span>
                      <span className="font-medium text-gray-900 flex items-center">
                        <Network className="w-4 h-4 mr-1 text-gray-400" />
                        {device.wifi_ip || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500 mb-1">Signal Strength</span>
                      <span className="font-medium text-gray-900 flex items-center">
                        <Signal className="w-4 h-4 mr-1 text-gray-400" />
                        {device.wifi_rssi ? `${device.wifi_rssi} dBm` : '-'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button 
                      onClick={() => setSelectedDevice(device)}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Manage Wi-Fi Networks
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center mb-4">
            <Server className="w-5 h-5 text-purple-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">System Integration</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supabase URL</label>
              <input 
                type="text" 
                disabled 
                value={import.meta.env.VITE_SUPABASE_URL || 'Not configured'} 
                className="w-full bg-gray-100 border-gray-300 rounded-md px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Database Status</label>
              <div className="w-full bg-green-50 border border-green-200 text-green-700 rounded-md px-3 py-2 text-sm flex items-center">
                <Shield className="w-4 h-4 mr-2" /> Connected & Secured
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center mb-4">
            <Info className="w-5 h-5 text-gray-400 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">About</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Smart Attendance Dashboard v1.0.0
            <br />
            An intelligent attendance tracking system using RFID technology, 
            Supabase real-time database, and AI-driven insights.
          </p>
        </div>
      </div>

      {selectedDevice && (
        <WifiManagerModal 
          device={selectedDevice} 
          isOpen={!!selectedDevice} 
          onClose={() => setSelectedDevice(null)} 
        />
      )}
    </div>
  );
};
