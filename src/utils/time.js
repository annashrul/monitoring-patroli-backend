// Utilitas waktu berbasis timezone aplikasi (APP_TIMEZONE, default Asia/Jakarta).
// Penting: bekerja lintas platform (Windows/Linux) tanpa bergantung pada env TZ.
import config from '../config.js';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.appTimezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Komponen waktu-dinding (wall clock) suatu Date di timezone aplikasi. */
export function tzParts(date = new Date()) {
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour: +parts.hour % 24,
    minute: +parts.minute,
    second: +parts.second,
  };
}

/**
 * Konversi "waktu dinding" di timezone aplikasi menjadi Date absolut (UTC).
 * Contoh: zonedTimeToUtc(2025, 1, 10, 6, 0) = jam 06:00 WIB dalam UTC.
 */
export function zonedTimeToUtc(year, month, day, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const p = tzParts(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess - (asUtc - guess));
}

/** Awal hari (00:00) untuk string tanggal 'YYYY-MM-DD' menurut timezone aplikasi. */
export function startOfDayInTimezone(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return null;
  return zonedTimeToUtc(+m[1], +m[2], +m[3], 0, 0);
}

function toMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + (m || 0);
}

function parseTime(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return [h || 0, m || 0];
}

/**
 * Tentukan shift yang sedang berjalan beserta periode absolutnya.
 * shifts: array dari tabel shifts. Shift dengan end_time <= start_time
 * dianggap melewati tengah malam (misal 22:00 - 06:00).
 * Return: { shift, period: { start: Date, end: Date } } atau { shift: null, period: null }.
 */
export function getCurrentShiftPeriod(shifts, now = new Date()) {
  const p = tzParts(now);
  const nowMin = p.hour * 60 + p.minute;

  for (const s of shifts) {
    if (s.is_active === false) continue;
    const startMin = toMinutes(s.start_time);
    const endMin = toMinutes(s.end_time);
    if (startMin === endMin) continue; // abaikan shift invalid/24 jam

    const [sh, sm] = parseTime(s.start_time);
    const [eh, em] = parseTime(s.end_time);

    if (endMin > startMin) {
      // Shift normal (tidak melewati tengah malam)
      if (nowMin >= startMin && nowMin < endMin) {
        return {
          shift: s,
          period: {
            start: zonedTimeToUtc(p.year, p.month, p.day, sh, sm),
            end: zonedTimeToUtc(p.year, p.month, p.day, eh, em),
          },
        };
      }
    } else {
      // Shift melewati tengah malam
      if (nowMin >= startMin) {
        // mulai hari ini, selesai besok
        const start = zonedTimeToUtc(p.year, p.month, p.day, sh, sm);
        const end = new Date(zonedTimeToUtc(p.year, p.month, p.day, eh, em).getTime() + 86400000);
        return { shift: s, period: { start, end } };
      }
      if (nowMin < endMin) {
        // mulai kemarin, selesai hari ini
        const start = new Date(zonedTimeToUtc(p.year, p.month, p.day, sh, sm).getTime() - 86400000);
        const end = zonedTimeToUtc(p.year, p.month, p.day, eh, em);
        return { shift: s, period: { start, end } };
      }
    }
  }
  return { shift: null, period: null };
}
