/**
 * Местное время г. Миасс: Asia/Yekaterinburg (UTC+5 без сезонного перевода часов).
 */
export const MIASS_UTC_OFFSET_MINUTES = 300; // +05:00
export const MIASS_TIMEZONE = 'Asia/Yekaterinburg';

export interface MiassDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0 (Вс) - 6 (Сб)
  hours: number; // 0-23
  minutes: number; // 0-59
  totalMinutes: number; // hours * 60 + minutes
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:MM
}

export function getMiassDateParts(date: Date = new Date()): MiassDateParts {
  const shiftedMs = date.getTime() + MIASS_UTC_OFFSET_MINUTES * 60_000;
  const shifted = new Date(shiftedMs);

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateString = `${year}-${pad(month)}-${pad(day)}`;
  const timeString = `${pad(hours)}:${pad(minutes)}`;

  return {
    year,
    month,
    day,
    weekday,
    hours,
    minutes,
    totalMinutes,
    dateString,
    timeString,
  };
}

export function parseHhMmToMinutes(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHhMm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Создаёт объект Date (UTC timestamp), соответствующий указанному времени HH:MM
 * в сегодняшнем дне по времени Миасса (Asia/Yekaterinburg, UTC+5).
 */
export function createMiassTodayDateFromMinutes(
  totalMinutes: number,
  now: Date = new Date()
): Date {
  const parts = getMiassDateParts(now);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const utcMs =
    Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0) -
    MIASS_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMs);
}

/**
 * Возвращает границы (начало и конец) дня в Миассе как Date (для запросов TIMESTAMPTZ).
 */
export function getMiassDayBounds(dateStr?: string, now: Date = new Date()): { start: Date; end: Date } {
  const parts = getMiassDateParts(now);
  let y = parts.year;
  let m = parts.month;
  let d = parts.day;

  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [ys, ms, ds] = dateStr.split('-').map(Number);
    y = ys;
    m = ms;
    d = ds;
  }

  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - MIASS_UTC_OFFSET_MINUTES * 60_000;
  const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - MIASS_UTC_OFFSET_MINUTES * 60_000;
  return {
    start: new Date(startMs),
    end: new Date(endMs),
  };
}

export function formatMiassTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return getMiassDateParts(d).timeString;
}

export function formatMiassDateTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const p = getMiassDateParts(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${p.timeString}`;
}
