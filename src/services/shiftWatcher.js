import { getCurrentShiftInfo } from './shiftService.js';

const normalize = (s) => ({
  id: s.id,
  name: s.name,
  start_time: String(s.start_time).slice(0, 5),
  end_time: String(s.end_time).slice(0, 5),
  is_active: s.is_active,
});

/**
 * Cek setiap 30 detik apakah periode shift sudah berganti.
 * Jika berganti -> emit 'shift:changed' agar semua client refetch
 * (semua pos otomatis kembali MERAH pada periode baru).
 */
export function startShiftWatcher(io) {
  let lastKey = null;

  const check = async () => {
    try {
      const { shift, period } = await getCurrentShiftInfo();
      const key = shift ? `${shift.id}|${period.start.toISOString()}` : 'none';

      if (lastKey === null) {
        lastKey = key; // inisialisasi pertama, tidak emit
        return;
      }
      if (key !== lastKey) {
        lastKey = key;
        console.log(`Shift berganti: ${shift ? shift.name : '(tidak ada shift aktif)'}`);
        io.emit('shift:changed', {
          shift: shift ? normalize(shift) : null,
          period: period
            ? { start: period.start.toISOString(), end: period.end.toISOString() }
            : null,
        });
      }
    } catch {
      // abaikan error sementara (misal koneksi DB putus), coba lagi di interval berikutnya
    }
  };

  check();
  setInterval(check, 30000);
}
