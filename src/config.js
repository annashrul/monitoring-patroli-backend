import dotenv from 'dotenv';

dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-ganti-di-production',
  appTimezone: process.env.APP_TIMEZONE || 'Asia/Jakarta',
  mqttUrl: process.env.MQTT_URL || '',
  mqttUsername: process.env.MQTT_USERNAME || '',
  mqttPassword: process.env.MQTT_PASSWORD || '',
  locationHistoryIntervalMs: parseInt(process.env.LOCATION_HISTORY_INTERVAL_MS || '20000', 10),
};

export default config;
