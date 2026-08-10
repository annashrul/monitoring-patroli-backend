// Seed akun awal: admin/admin123 dan satpam/satpam123
// Jalankan: npm run seed  (pastikan .env sudah terisi kredensial Supabase yang benar)
import bcrypt from 'bcryptjs';
import { supabase } from '../src/supabase.js';

async function upsertUser(username, password, name, role) {
  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (findErr) {
    console.error(`Gagal cek user ${username}:`, findErr.message);
    process.exitCode = 1;
    return;
  }
  if (existing) {
    console.log(`User '${username}' sudah ada, dilewati.`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supabase
    .from('users')
    .insert({ username, password_hash, name, role });

  if (error) {
    console.error(`Gagal membuat user '${username}':`, error.message);
    process.exitCode = 1;
  } else {
    console.log(`User '${username}' dibuat (password: ${password})`);
  }
}

console.log('Menjalankan seed...');
await upsertUser('owner', 'owner123', 'Owner', 'owner');
await upsertUser('admin', 'admin123', 'Administrator', 'admin');
await upsertUser('satpam', 'satpam123', 'Satpam Contoh', 'satpam');
console.log('Seed selesai.');
