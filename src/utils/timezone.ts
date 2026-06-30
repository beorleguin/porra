import { Match } from '../domain/types';

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getUserLocale(lang?: 'es' | 'en'): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'es') return 'es-ES';

  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }

  return 'es-ES';
}

export function parseKickoffAtUtcFromLocalOffset(date?: string, time?: string): string | undefined {
  if (!date || !time) return undefined;

  const timeMatch = String(time).trim().match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})$/i);
  if (!timeMatch) return undefined;

  const dateMatch = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return undefined;

  const [, yearRaw, monthRaw, dayRaw] = dateMatch;
  const [, hourRaw, minuteRaw, offsetRaw] = timeMatch;

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const offset = Number(offsetRaw);

  if ([year, month, day, hour, minute, offset].some(value => !Number.isFinite(value))) {
    return undefined;
  }

  // Ejemplo: 12:00 UTC-4 = 16:00 UTC. El offset se resta para llevarlo a UTC.
  const utcMs = Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0);
  return new Date(utcMs).toISOString();
}

export function getKickoffAtUtc(match: Match): string | undefined {
  return match.kickoffAtUtc || parseKickoffAtUtcFromLocalOffset(match.date, match.time);
}

export function getKickoffTimeMs(match: Match): number | null {
  const kickoffAtUtc = getKickoffAtUtc(match);

  if (!kickoffAtUtc) return null;

  const value = new Date(kickoffAtUtc).getTime();
  return Number.isFinite(value) ? value : null;
}

export function formatMatchLocalDateTime(match: Match, lang: 'es' | 'en' = 'es'): string {
  const kickoffAtUtc = getKickoffAtUtc(match);

  if (!kickoffAtUtc) {
    if (match.date && match.time) return `${match.date} ${match.time}`;
    return match.date || match.time || '';
  }

  const date = new Date(kickoffAtUtc);
  const locale = getUserLocale(lang);
  const timeZone = getUserTimeZone();

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

export function formatMatchLocalTime(match: Match, lang: 'es' | 'en' = 'es'): string {
  const kickoffAtUtc = getKickoffAtUtc(match);

  if (!kickoffAtUtc) return match.time || '';

  const date = new Date(kickoffAtUtc);
  const locale = getUserLocale(lang);
  const timeZone = getUserTimeZone();

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

export function getOriginalMatchDateTime(match: Match): string {
  if (match.date && match.time) return `${match.date} @ ${match.time}`;
  return match.date || match.time || '';
}

export function isMatchLive(match: Match, realResultsMatches: Record<string, string>): boolean {
  const kickoffTime = getKickoffTimeMs(match);
  if (!kickoffTime) return false;

  const now = Date.now();
  const durationMs = 2 * 60 * 60 * 1000; // 2 hours (120 minutes)

  // Check if real results already have a settled score
  const score = realResultsMatches[match.id];
  const hasResult = score && score.trim() !== '' && score.trim() !== '-';

  return now >= kickoffTime && now < kickoffTime + durationMs && !hasResult;
}
