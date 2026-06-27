import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.warn('[manos] Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
}

export const supabase = createClient(URL || 'https://placeholder.supabase.co', KEY || 'placeholder', {
  realtime: { params: { eventsPerSecond: 5 } },
  auth: { persistSession: false }
});

// Hash anonimo del dispositivo (rate-limiting sin identificar)
export function getDeviceHash() {
  let hash = localStorage.getItem('manos_device_hash');
  if (!hash) {
    hash = crypto.randomUUID();
    localStorage.setItem('manos_device_hash', hash);
  }
  return hash;
}
