// Maps non-standard country codes used in the Excel spreadsheet
export function normalizeTeamCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (c === 'CZK') return 'CZE';
  if (c === 'BYH') return 'BIH';
  if (c === 'CAT') return 'QAT';
  if (c === 'EGP') return 'EGY';
  if (c === 'IRA') return 'IRN';
  return c;
}

// Maps 3-letter team codes (normalized) to their 2-letter ISO codes for FlagCDN
const CODE_3_TO_2: Record<string, string> = {
  MEX: 'mx', RSA: 'za', KOR: 'kr', CZE: 'cz',
  CAN: 'ca', BIH: 'ba', USA: 'us', PAR: 'py',
  QAT: 'qa', SUI: 'ch', BRA: 'br', MAR: 'ma',
  HAI: 'ht', SCO: 'gb-sct', AUS: 'au', TUR: 'tr',
  GER: 'de', CUW: 'cw', NED: 'nl', JPN: 'jp',
  CIV: 'ci', ECU: 'ec', SWE: 'se', TUN: 'tn',
  ESP: 'es', CPV: 'cv', BEL: 'be', EGY: 'eg',
  KSA: 'sa', URU: 'uy', IRN: 'ir', NZL: 'nz',
  FRA: 'fr', SEN: 'sn', IRQ: 'iq', NOR: 'no',
  ARG: 'ar', ALG: 'dz', AUT: 'at', JOR: 'jo',
  POR: 'pt', CGO: 'cd', // DR Congo is 'cd' (not Republic of Congo 'cg')
  ENG: 'gb-eng', CRO: 'hr', GHA: 'gh', PAN: 'pa',
  UZB: 'uz', COL: 'co'
};

// Maps API full team names to their 3-letter codes (normalized)
const NAME_TO_CODE: Record<string, string> = {
  'mexico': 'MEX',
  'south africa': 'RSA',
  'south korea': 'KOR',
  'korea republic': 'KOR',
  'republic of korea': 'KOR',
  'czech republic': 'CZE',
  'czechia': 'CZE',
  'canada': 'CAN',
  'bosnia and herzegovina': 'BIH',
  'bosnia & herzegovina': 'BIH',
  'united states': 'USA',
  'usa': 'USA',
  'u.s.a.': 'USA',
  'united states of america': 'USA',
  'paraguay': 'PAR',
  'qatar': 'QAT',
  'switzerland': 'SUI',
  'brazil': 'BRA',
  'morocco': 'MAR',
  'haiti': 'HAI',
  'scotland': 'SCO',
  'australia': 'AUS',
  'turkey': 'TUR',
  'turkiye': 'TUR',
  'türkiye': 'TUR',
  'germany': 'GER',
  'curaçao': 'CUW',
  'curacao': 'CUW',
  'netherlands': 'NED',
  'japan': 'JPN',
  'ivory coast': 'CIV',
  "côte d'ivoire": 'CIV',
  "cote d'ivoire": 'CIV',
  'cote divoire': 'CIV',
  'ecuador': 'ECU',
  'sweden': 'SWE',
  'tunisia': 'TUN',
  'spain': 'ESP',
  'cape verde': 'CPV',
  'belgium': 'BEL',
  'egypt': 'EGY',
  'saudi arabia': 'KSA',
  'uruguay': 'URU',
  'iran': 'IRN',
  'new zealand': 'NZL',
  'france': 'FRA',
  'senegal': 'SEN',
  'iraq': 'IRQ',
  'norway': 'NOR',
  'argentina': 'ARG',
  'algeria': 'ALG',
  'austria': 'AUT',
  'jordan': 'JOR',
  'portugal': 'POR',
  'congo': 'CGO',
  'dr congo': 'CGO',
  'congo dr': 'CGO',
  'democratic republic of congo': 'CGO',
  'd.r. congo': 'CGO',
  'england': 'ENG',
  'croatia': 'CRO',
  'ghana': 'GHA',
  'panama': 'PAN',
  'uzbekistan': 'UZB',
  'colombia': 'COL',
};

// Maps 3-letter team codes (normalized) to their official 2026 World Cup Group (Group A to Group L)
const REAL_TEAMS_GROUPS: Record<string, string> = {
  MEX: 'Group A', RSA: 'Group A', KOR: 'Group A', CZE: 'Group A',
  CAN: 'Group B', BIH: 'Group B', QAT: 'Group B', SUI: 'Group B',
  BRA: 'Group C', MAR: 'Group C', HAI: 'Group C', SCO: 'Group C',
  USA: 'Group D', PAR: 'Group D', AUS: 'Group D', TUR: 'Group D',
  GER: 'Group E', CUW: 'Group E', CIV: 'Group E', ECU: 'Group E',
  NED: 'Group F', JPN: 'Group F', SWE: 'Group F', TUN: 'Group F',
  BEL: 'Group G', EGY: 'Group G', IRN: 'Group G', NZL: 'Group G',
  ESP: 'Group H', CPV: 'Group H', KSA: 'Group H', URU: 'Group H',
  FRA: 'Group I', SEN: 'Group I', IRQ: 'Group I', NOR: 'Group I',
  ARG: 'Group J', ALG: 'Group J', AUT: 'Group J', JOR: 'Group J',
  POR: 'Group K', CGO: 'Group K', UZB: 'Group K', COL: 'Group K',
  ENG: 'Group L', CRO: 'Group L', GHA: 'Group L', PAN: 'Group L',
};

function normalizeNameKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ');
}

export function getCodeFromName(name: string): string | null {
  const normalized = normalizeNameKey(name);
  const code = NAME_TO_CODE[normalized] || null;
  return code ? normalizeTeamCode(code) : null;
}

export function getCanonicalTeamCode(team: string): string {
  const normalizedCode = normalizeTeamCode(String(team || ''));

  if (CODE_3_TO_2[normalizedCode]) {
    return normalizedCode;
  }

  const codeFromName = getCodeFromName(String(team || ''));

  return codeFromName || normalizedCode;
}

// Returns the URL of a beautiful, pixel-perfect PNG flag from FlagCDN.
// Supports both 3-letter codes (ARG, ENG, USA) and full country names
// returned by the stats API (ARGENTINA, ENGLAND, UNITED STATES, etc.).
export function getFlagImgUrl(teamCodeOrName: string): string {
  const code = getCanonicalTeamCode(teamCodeOrName);
  const iso2 = CODE_3_TO_2[code];

  if (iso2) {
    return `https://flagcdn.com/w40/${iso2}.png`;
  }

  return 'https://flagcdn.com/w40/un.png'; // Fallback
}

export function getRealGroupOfTeam(teamCode: string): string {
  const normalized = getCanonicalTeamCode(teamCode);
  return REAL_TEAMS_GROUPS[normalized] || 'Other Matches';
}
