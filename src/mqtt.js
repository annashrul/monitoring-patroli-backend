import mqtt from 'mqtt';
import config from './config.js';
import { supabase } from './supabase.js';
import { getIo } from './socket.js';
import { haversineMeters } from './utils/geo.js';

let client = null;

// Throttle penyimpanan riwayat lokasi per user (default 20 detik).
const lastHistoryWrite = new Map(); // userId -> epoch ms

// Posisi terakhir yang benar-benar tercatat per user (untuk deteksi pergerakan).
const lastRecorded = new Map(); // userId -> { latitude, longitude }

/**
 * Bridge MQTT → DB + Socket.IO untuk live tracking satpam.
 *
 * Mobile mem-publish lokasi ke topik `patroli/satpam/{userId}/location`.
 * Backend berlangganan, menyimpan lokasi terakhir ke tabel `users`,
 * lalu meneruskan ke Socket.IO (event `satpam:location` ke admin,
 * `satpam:otherLocation` ke satpam lain di site yang sama).
 *
 * Status online/offline dikirim lewat topik `patroli/satpam/{userId}/status`
 * (retained + Last Will). Saat offline, backend mengirim `satpam:offline`.
 */
export function startMqttClient() {
  if (!config.mqttUrl) {
    console.log('MQTT tidak dikonfigurasi (MQTT_URL kosong) — live tracking MQTT dinonaktifkan.');
    return;
  }

  client = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername,
    password: config.mqttPassword,
    clientId: `backend_${Math.random().toString(16).slice(2, 10)}`,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    console.log(`MQTT terhubung: ${config.mqttUrl}`);
    client.subscribe('patroli/satpam/+/location', { qos: 1 });
    client.subscribe('patroli/satpam/+/status', { qos: 1 });
  });

  client.on('message', async (topic, payload) => {
    // topic: patroli/satpam/<userId>/location|status
    const parts = String(topic).split('/');
    if (parts.length < 4) return;
    const userId = parts[2];
    const kind = parts[3];

    try {
      if (kind === 'location') {
        await handleLocation(userId, JSON.parse(payload.toString()));
      } else if (kind === 'status') {
        await handleStatus(userId, JSON.parse(payload.toString()));
      }
    } catch (e) {
      console.error('MQTT message error:', e.message);
    }
  });

  client.on('error', (e) => console.error('MQTT error:', e.message));
}

async function handleLocation(userId, data) {
  const { latitude, longitude } = data || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

  await supabase
    .from('users')
    .update({
      last_latitude: latitude,
      last_longitude: longitude,
      last_location_at: new Date().toISOString(),
    })
    .eq('id', userId);

  // Simpan snapshot riwayat lokasi tiap interval (default 20 detik),
  // tapi hanya jika satpam benar-benar berpindah (>= LOCATION_MIN_DISTANCE_M).
  const now = Date.now();
  const last = lastHistoryWrite.get(userId) || 0;
  if (now - last >= config.locationHistoryIntervalMs) {
    lastHistoryWrite.set(userId, now);
    const prev = lastRecorded.get(userId);
    const moved =
      !prev ||
      haversineMeters(prev.latitude, prev.longitude, latitude, longitude) >=
        config.locationMinDistanceM;
    if (moved) {
      lastRecorded.set(userId, { latitude, longitude });
      const { error } = await supabase.from('satpam_locations').insert({
        user_id: userId,
        latitude,
        longitude,
        recorded_at: new Date().toISOString(),
      });
      if (error) console.error('Gagal simpan riwayat lokasi:', error.message);
    }
  }

  const { data: u } = await supabase
    .from('users')
    .select('name, color, site_id')
    .eq('id', userId)
    .maybeSingle();

  const payload = {
    id: userId,
    name: u?.name || data?.name || 'Satpam',
    latitude,
    longitude,
    color: u?.color || '#3B82F6',
    site_id: u?.site_id || null,
    timestamp: data?.timestamp || new Date().toISOString(),
  };

  const io = getIo();
  if (!io) return;
  io.to('admins').emit('satpam:location', payload);
  if (payload.site_id) {
    io.to(`site:${payload.site_id}`).emit('satpam:otherLocation', payload);
  }
}

async function handleStatus(userId, data) {
  // Hanya peduli pada transisi offline (Last Will / logout).
  if (data?.online !== false) return;

  const io = getIo();
  if (!io) return;

  const { data: u } = await supabase
    .from('users')
    .select('site_id')
    .eq('id', userId)
    .maybeSingle();

  io.to('admins').emit('satpam:offline', { id: userId });
  if (u?.site_id) {
    io.to(`site:${u.site_id}`).emit('satpam:otherOffline', { id: userId });
  }
}
