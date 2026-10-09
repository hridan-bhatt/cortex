export interface StratumDefinition {
  index: number;
  label: string;
  typeKeywords: string[];
  nameKeywords: string[];
}

export type AppTheme = 'night' | 'paper';

export const THEME_COLORS: Record<AppTheme, {
  bg: string;
  surface: string;
  surface2: string;
  hairline: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  impact: string;
  ember: string;
  failure: string;
  selected: string;
}> = {
  night: {
    bg: '#0B0D12',
    surface: '#12151C',
    surface2: '#1A1E28',
    hairline: '#242A37',
    ink: '#EAEDF4',
    muted: '#8F9092',
    faint: '#5C5D60',
    accent: '#FFB454',
    impact: '#FFB454',
    ember: '#FF4553',
    failure: '#FF4553',
    selected: '#F8FAFC',
  },
  paper: {
    bg: '#E6E0D3',
    surface: '#EFEAE0',
    surface2: '#F5F1E9',
    hairline: '#C9C1AF',
    ink: '#201C16',
    muted: '#635D4F',
    faint: '#807968',
    accent: '#7E5F1B',
    impact: '#9C6714',
    ember: '#A82240',
    failure: '#A82240',
    selected: '#201C16',
  },
};

export interface Theme3DValues {
  fogColor: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  dir1Color: string;
  dir1Intensity: number;
  dir1Pos: [number, number, number];
  dir2Color: string;
  dir2Intensity: number;
  dir2Pos: [number, number, number];
  fiberTheme: number;
}

export function compute3DThemeValues(theme: AppTheme): Theme3DValues {
  const isPaper = theme === 'paper';
  return {
    fogColor: isPaper ? '#E6E0D3' : '#0B0D12',
    hemiSky: isPaper ? '#FAF7F0' : '#3A4152',
    hemiGround: isPaper ? '#C4BCA8' : '#0B0D12',
    hemiIntensity: isPaper ? 0.75 : 0.35,
    dir1Color: isPaper ? '#FFFBF5' : '#FFF4E0',
    dir1Intensity: isPaper ? 1.25 : 0.85,
    dir1Pos: isPaper ? [-70, 110, 60] : [60, 90, 40],
    dir2Color: isPaper ? '#D8CFB8' : '#5C7CDB',
    dir2Intensity: isPaper ? 0.20 : 0.35,
    dir2Pos: isPaper ? [70, -40, -50] : [-70, 30, -80],
    fiberTheme: isPaper ? 1.0 : 0.0,
  };
}

export const STRATA_ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'] as const;

export function getStratumRoman(index: number): string {
  return STRATA_ROMAN[index] || String(index + 1);
}

export function formatStratumLabel(index: number, name: string, count?: number): string {
  const roman = getStratumRoman(index);
  const technical = name.toLowerCase();
  return count !== undefined ? `${roman} · ${technical} · ${count}` : `${roman} · ${technical}`;
}

export const STRATUM_COLORS_BY_THEME: Record<AppTheme, Record<number, string>> = {
  night: {
    0: '#E08A3C', // CONTROLLERS (burnt ochre)
    1: '#5E9FD4', // SERVICES (steel blue)
    2: '#A98BD0', // COMPONENTS (dusty violet)
    3: '#4EAE97', // REPOSITORIES (jade)
    4: '#93B356', // DATA (olive)
    5: '#D0687A', // CONFIG (dusty rose)
    6: '#8A8E96', // UNCLASSIFIED (neutral)
    7: '#606672', // EXTERNAL (graphite)
  },
  paper: {
    0: '#B84A1C', // CONTROLLERS (warm terracotta ink — 4.1:1 contrast)
    1: '#1E5088', // SERVICES (lapis blue ink — 5.9:1 contrast)
    2: '#583A82', // COMPONENTS (royal iris ink — 6.8:1 contrast)
    3: '#0E6E56', // REPOSITORIES (alpine viridian ink — 4.8:1 contrast)
    4: '#526A18', // DATA (antique moss ink — 4.6:1 contrast)
    5: '#A82240', // CONFIG (carmine cinnabar ink — 5.4:1 contrast)
    6: '#3D434D', // UNCLASSIFIED (warm slate lead ink — 7.7:1 contrast)
    7: '#262B33', // EXTERNAL (carbon black ink — 11.2:1 contrast)
  },
};

let _activeTheme: AppTheme =
  (typeof window !== 'undefined'
    ? (localStorage.getItem('cortex.theme') as AppTheme)
    : null) || 'night';

export function setActiveTheme(theme: AppTheme): void {
  _activeTheme = theme;
}

export function getActiveTheme(): AppTheme {
  return _activeTheme;
}

export const STRATUM_COLORS: Record<number, string> = new Proxy(
  {},
  {
    get: (_, prop) => {
      const idx = typeof prop === 'string' ? Number(prop) : Number(prop);
      return (
        STRATUM_COLORS_BY_THEME[_activeTheme]?.[idx] ||
        STRATUM_COLORS_BY_THEME[_activeTheme]?.[6] ||
        '#8A8E96'
      );
    },
  }
);

export const COLOR_FAILURE = '#FF4553';
export const COLOR_SELECTED = '#F8FAFC';
export const COLOR_ACCENT = '#FFB454';

export const STRATA_DEFINITIONS: StratumDefinition[] = [
  {
    index: 0,
    label: 'CONTROLLERS',
    typeKeywords: ['controller', 'api', 'rest', 'endpoint'],
    nameKeywords: [],
  },
  {
    index: 1,
    label: 'SERVICES',
    typeKeywords: ['service'],
    nameKeywords: [],
  },
  {
    index: 2,
    label: 'COMPONENTS',
    typeKeywords: [],
    nameKeywords: [
      'mapper', 'handler', 'listener', 'filter', 'interceptor',
      'aspect', 'util', 'helper', 'validator', 'converter',
      'exception', 'error', 'factory', 'builder'
    ],
  },
  {
    index: 3,
    label: 'REPOSITORIES',
    typeKeywords: ['repository', 'repo'],
    nameKeywords: [],
  },
  {
    index: 4,
    label: 'DATA',
    typeKeywords: ['model', 'entity', 'domain', 'dto'],
    nameKeywords: ['dto', 'request', 'response', 'record'],
  },
  {
    index: 5,
    label: 'CONFIG',
    typeKeywords: ['config', 'application', 'main', 'component'],
    nameKeywords: ['config', 'properties'],
  },
  {
    index: 6,
    label: 'UNCLASSIFIED',
    typeKeywords: [],
    nameKeywords: [],
  },
  {
    index: 7,
    label: 'EXTERNAL',
    typeKeywords: ['librar', 'external', 'starter', 'dependency', 'package', 'maven', 'gradle', 'jar'],
    nameKeywords: [],
  },
];

export const HOSPITAL_STRATA_DEFINITIONS: StratumDefinition[] = [
  {
    index: 0,
    label: 'PATIENTS',
    typeKeywords: ['patient'],
    nameKeywords: ['patient'],
  },
  {
    index: 1,
    label: 'PRESCRIPTIONS',
    typeKeywords: ['prescription', 'rx'],
    nameKeywords: ['prescription', 'rx'],
  },
  {
    index: 2,
    label: 'MEDICATIONS',
    typeKeywords: ['medication', 'drug', 'pharm'],
    nameKeywords: ['medication', 'drug', 'pharm', 'warfarin', 'aspirin', 'lisinopril', 'metformin', 'spironolactone'],
  },
  {
    index: 6,
    label: 'UNCLASSIFIED',
    typeKeywords: [],
    nameKeywords: [],
  },
];

export const HOSPITAL_STRATUM_COLORS_BY_THEME: Record<AppTheme, Record<number, string>> = {
  night: {
    0: '#E08A3C', // PATIENTS (burnt ochre)
    1: '#A98BD0', // PRESCRIPTIONS (dusty violet)
    2: '#4EAE97', // MEDICATIONS (jade)
    6: '#8A8E96', // UNCLASSIFIED (neutral)
  },
  paper: {
    0: '#B84A1C', // PATIENTS (warm terracotta ink)
    1: '#583A82', // PRESCRIPTIONS (royal iris ink)
    2: '#0E6E56', // MEDICATIONS (alpine viridian ink)
    6: '#3D434D', // UNCLASSIFIED (warm slate lead ink)
  },
};

export const HOSPITAL_STRATUM_COLORS: Record<number, string> = new Proxy(
  {},
  {
    get: (_, prop) => {
      const idx = typeof prop === 'string' ? Number(prop) : Number(prop);
      return (
        HOSPITAL_STRATUM_COLORS_BY_THEME[_activeTheme]?.[idx] ||
        HOSPITAL_STRATUM_COLORS_BY_THEME[_activeTheme]?.[6] ||
        '#8A8E96'
      );
    },
  }
);

let _activeAdapter = 'vaultx';

export function setActiveAdapter(adapter: string): void {
  _activeAdapter = adapter;
}

export function getActiveAdapter(): string {
  return _activeAdapter;
}

/**
 * Classify by entityType first; if that lands in UNCLASSIFIED (6),
 * retry lowercased entityName against components/strata keywords.
 */
export function classifyNode(
  node: { entityType?: string; entityName?: string },
  adapter?: string
): number {
  const actAdapter = adapter || _activeAdapter;
  if (actAdapter === 'hospital') {
    const t = (node.entityType || '').toLowerCase();
    const name = (node.entityName || '').toLowerCase();

    // 1. Classify hospital by entityType
    if (matchesAny(t, ['patient'])) return 0;
    if (matchesAny(t, ['prescription', 'rx'])) return 1;
    if (matchesAny(t, ['medication', 'drug', 'pharm'])) return 2;

    // 2. Classify hospital by entityName
    if (matchesAny(name, ['patient'])) return 0;
    if (matchesAny(name, ['prescription', 'rx'])) return 1;
    if (matchesAny(name, ['medication', 'drug', 'pharm', 'warfarin', 'aspirin', 'lisinopril', 'metformin', 'spironolactone'])) return 2;

    return 6;
  }

  const t = (node.entityType || '').toLowerCase();
  const name = (node.entityName || '').toLowerCase();

  // 1. Classify by entityType first
  if (matchesAny(t, ['controller', 'api', 'rest', 'endpoint'])) return 0;
  if (matchesAny(t, ['service'])) return 1;
  if (matchesAny(t, ['repository', 'repo'])) return 3;
  if (matchesAny(t, ['model', 'entity', 'domain', 'dto'])) return 4;
  if (matchesAny(t, ['config', 'application', 'main', 'component'])) return 5;
  if (matchesAny(t, ['librar', 'external', 'starter', 'dependency', 'package', 'maven', 'gradle', 'jar'])) return 7;

  // 2. Unmatched by entityType: retry lowercased entityName
  // Against CONTROLLERS:
  if (matchesAny(name, ['controller', 'api', 'endpoint'])) return 0;
  // Against SERVICES:
  if (matchesAny(name, ['service'])) return 1;
  // Against REPOSITORIES:
  if (matchesAny(name, ['repository', 'repo'])) return 3;
  // Against COMPONENTS:
  if (matchesAny(name, [
    'mapper', 'handler', 'listener', 'filter', 'interceptor',
    'aspect', 'util', 'helper', 'validator', 'converter',
    'exception', 'error', 'factory', 'builder'
  ])) return 2;
  // Against DATA:
  if (matchesAny(name, ['dto', 'request', 'response', 'record', 'model', 'entity', 'event', 'status', 'role', 'type'])) return 4;
  // Against CONFIG:
  if (matchesAny(name, ['config', 'properties', 'application'])) return 5;

  // 3. Fallback to UNCLASSIFIED
  return 6;
}

function matchesAny(str: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (str.includes(kw)) return true;
  }
  return false;
}

export function getStratumDefinition(index: number, adapter?: string): StratumDefinition {
  const actAdapter = adapter || _activeAdapter;
  if (actAdapter === 'hospital') {
    return (
      HOSPITAL_STRATA_DEFINITIONS.find((d) => d.index === index) ||
      HOSPITAL_STRATA_DEFINITIONS.find((d) => d.index === 6)!
    );
  }
  return STRATA_DEFINITIONS.find((d) => d.index === index) || STRATA_DEFINITIONS[6];
}

export function getStratumColor(index: number, adapter?: string, theme?: AppTheme): string {
  const actTheme = theme || _activeTheme;
  const actAdapter = adapter || _activeAdapter;
  if (actAdapter === 'hospital') {
    return (
      HOSPITAL_STRATUM_COLORS_BY_THEME[actTheme]?.[index] ||
      HOSPITAL_STRATUM_COLORS_BY_THEME[actTheme]?.[6] ||
      '#8A8E96'
    );
  }
  return (
    STRATUM_COLORS_BY_THEME[actTheme]?.[index] ||
    STRATUM_COLORS_BY_THEME[actTheme]?.[6] ||
    '#8A8E96'
  );
}

/**
 * STEP 0 — RECON (log to console, do not skip)
 */
export function performReconLog(nodes: Array<{ entityType?: string; entityName?: string; properties?: Record<string, any> }>): void {
  console.log('=== [recon] STEP 0 — RECON START ===');

  // 1. Every distinct entityType with count and 3 sample entityNames
  const byType = new Map<string, string[]>();
  for (const n of nodes) {
    const t = n.entityType || 'unknown';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(n.entityName || 'unnamed');
  }
  console.log('[recon] Distinct entityTypes with counts and samples:');
  for (const [type, names] of byType.entries()) {
    console.log(`  - ${type} (${names.length}): [${names.slice(0, 3).join(', ')}]`);
  }

  // 2. Union of property keys across all nodes
  const allKeys = new Set<string>();
  for (const n of nodes) {
    if (n.properties) {
      Object.keys(n.properties).forEach((k) => allKeys.add(k));
    }
  }
  console.log('[recon] Union of property keys:', Array.from(allKeys).sort());

  // Full JSON of sample Controller, Class, Library nodes
  const controllerSample = nodes.find((n) => (n.entityType || '').toLowerCase() === 'controller');
  const classSample = nodes.find((n) => (n.entityType || '').toLowerCase() === 'class');
  const librarySample = nodes.find((n) => (n.entityType || '').toLowerCase() === 'library');

  console.log('[recon] Sample Controller node:', controllerSample ? JSON.stringify(controllerSample, null, 2) : 'none');
  console.log('[recon] Sample Class node:', classSample ? JSON.stringify(classSample, null, 2) : 'none');
  console.log('[recon] Sample Library node:', librarySample ? JSON.stringify(librarySample, null, 2) : 'none');

  // 3. Check for a package/file/path property usable for clustering
  const clusterCandidates = ['package', 'fqn', 'qualifiedName', 'filePath', 'file_path', 'file', 'path', 'location'];
  const foundKeys = clusterCandidates.filter((k) => allKeys.has(k));
  if (foundKeys.length > 0) {
    console.log(`[recon] Clustering property candidate found: "${foundKeys[0]}" (from candidates: ${foundKeys.join(', ')}). Clustering is ENABLED.`);
  } else {
    console.log('[recon] No package/file/path clustering property found. Clustering is DISABLED.');
  }

  console.log('=== [recon] STEP 0 — RECON END ===');
}

/**
 * Log untruncated [strata] distribution
 */
export function logStrataDistribution(
  nodes: Array<{ entityType?: string; entityName?: string }>,
  adapter?: string
): void {
  const typeMap = new Map<string, { count: number; strata: Map<number, number> }>();

  for (const node of nodes) {
    const t = node.entityType || 'unknown';
    const s = classifyNode(node, adapter);

    if (!typeMap.has(t)) {
      typeMap.set(t, { count: 0, strata: new Map() });
    }
    const info = typeMap.get(t)!;
    info.count += 1;
    info.strata.set(s, (info.strata.get(s) || 0) + 1);
  }

  const entries: string[] = [];
  for (const [type, info] of typeMap.entries()) {
    if (info.strata.size === 1) {
      const s = info.strata.keys().next().value;
      entries.push(`${type}(${info.count}) -> ${s}`);
    } else {
      const breakdown = Array.from(info.strata.entries())
        .map(([s, c]) => `${s}:${c}`)
        .join('/');
      entries.push(`${type}(${info.count}) -> [${breakdown}]`);
    }
  }

  console.log(`[strata] ${entries.join(', ')}`);
}
