/**
 * Parses a match's date and time strings into a JavaScript Date object.
 * Supports:
 * - dateStr: "2026-06-11" (ISO) or "28 Jun 2026" (Knockout format)
 * - timeStr: "13:00 UTC-6", "15:00 UTC-7", "21:00 UTC", or just "15:00"
 */
export function parseDateTimeToClientDate(dateStr: string | undefined, timeStr: string | undefined): Date | null {
  if (!dateStr) return null;

  const months: Record<string, string> = {
    'Jan': '01', 'Ene': '01',
    'Feb': '02',
    'Mar': '03',
    'Apr': '04', 'Abr': '04',
    'May': '05',
    'Jun': '06',
    'Jul': '07',
    'Aug': '08', 'Ago': '08',
    'Sep': '09',
    'Oct': '10',
    'Nov': '11',
    'Dec': '12', 'Dic': '12'
  };

  let formattedDate = dateStr.trim();
  const parts = formattedDate.split(/\s+/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const monthAbbr = parts[1].substring(0, 3);
    const month = months[monthAbbr] || '01';
    const year = parts[2];
    formattedDate = `${year}-${month}-${day}`;
  }

  const trimmedTime = (timeStr || '00:00').trim();
  let timePart = '00:00';
  let offsetPart = 'Z'; // Default to UTC

  const utcOffsetRegex = /^(\d{2}:\d{2})\s*UTC([-+]\d+)$/i;
  const match = trimmedTime.match(utcOffsetRegex);

  if (match) {
    timePart = match[1];
    const offsetNum = parseInt(match[2], 10);
    const sign = offsetNum >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetNum).toString().padStart(2, '0');
    offsetPart = `${sign}${absOffset}:00`;
  } else {
    const simpleTimeRegex = /^(\d{2}:\d{2})$/;
    if (simpleTimeRegex.test(trimmedTime)) {
      timePart = trimmedTime;
      offsetPart = ''; // Will parse in client's local time if no timezone
    } else if (trimmedTime.toLowerCase().includes('utc')) {
      const utcRegex = /^(\d{2}:\d{2})\s*utc$/i;
      const utcMatch = trimmedTime.match(utcRegex);
      if (utcMatch) {
        timePart = utcMatch[1];
        offsetPart = 'Z';
      }
    }
  }

  const isoStr = `${formattedDate}T${timePart}:00${offsetPart}`;
  const timestamp = Date.parse(isoStr);
  return isNaN(timestamp) ? null : new Date(timestamp);
}

/**
 * Formats a match date into the client's local date format.
 * E.g., "11 Jun 2026" or "11 de jun. de 2026"
 */
export function formatMatchDateToClient(dateStr: string | undefined, timeStr: string | undefined, lang: 'es' | 'en'): string {
  if (!dateStr) return '';
  const date = parseDateTimeToClientDate(dateStr, timeStr);
  if (!date) return dateStr;

  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Formats a match time into the client's local time format, including timezone info.
 * E.g., "21:00 (CEST)" or "15:00 (EDT)"
 */
export function formatMatchTimeToClient(dateStr: string | undefined, timeStr: string | undefined, lang: 'es' | 'en'): string {
  if (!timeStr) return '';
  const date = parseDateTimeToClientDate(dateStr, timeStr);
  if (!date) return timeStr;

  const formattedTime = date.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Get short timezone name, e.g., "CEST", "GMT+2", etc.
  const tzName = Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value || '';

  return tzName ? `${formattedTime} (${tzName})` : formattedTime;
}
