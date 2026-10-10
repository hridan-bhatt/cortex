import { getStratumRoman } from '../domain/strata';

export interface BeatDefinition {
  id: number;
  label: string;
  gaugeLabel: string;
  alignment: 'left' | 'right' | 'center';
  title: (ctx: BeatContext) => string;
  subtitle?: string | ((ctx: BeatContext) => string);
  meta: (ctx: BeatContext) => string;
  cue?: string;
  buttonText?: string;
  countKey?: string;
  stratumIndex?: number;
}

export interface BeatContext {
  adapter: string;
  projectName?: string;
  entitiesCount: number;
  relationshipsCount: number;
  controllersCount: number;
  servicesCount: number;
  componentsCount: number;
  repositoriesCount: number;
  dataCount: number;
  librariesCount: number;
  patientsCount?: number;
  prescriptionsCount?: number;
  medicationsCount?: number;
  godClassName: string;
  godClassOutDegree: number;
}

export const VAULTX_BEATS: BeatDefinition[] = [
  {
    id: 0,
    label: 'surface',
    gaugeLabel: 'SURFACE',
    alignment: 'left',
    title: () => 'cortex',
    subtitle: (ctx) => `codebase intelligence · ${ctx.projectName || 'vaultx'}`,
    meta: (ctx) => `${ctx.entitiesCount} entities · ${ctx.relationshipsCount} relationships · one codebase`,
    cue: 'scroll to descend',
  },
  {
    id: 1,
    label: 'layer i — controllers',
    gaugeLabel: 'L-I · CONTROLLERS',
    alignment: 'right',
    title: () => 'layer i — controllers',
    subtitle: 'every request enters here.',
    meta: (ctx) => `i · controllers · ${ctx.controllersCount}`,
    countKey: 'controllersCount',
  },
  {
    id: 2,
    label: 'layer ii — services',
    gaugeLabel: 'L-II · SERVICES',
    alignment: 'left',
    title: () => 'layer ii — services',
    subtitle: 'the work gets done here.',
    meta: (ctx) => `ii · services · ${ctx.servicesCount}`,
    countKey: 'servicesCount',
  },
  {
    id: 3,
    label: 'layer iii — components',
    gaugeLabel: 'L-III · COMPONENTS',
    alignment: 'right',
    title: () => 'layer iii — components',
    subtitle: 'mappers · handlers · guards.',
    meta: (ctx) => `iii · components · ${ctx.componentsCount}`,
    countKey: 'componentsCount',
  },
  {
    id: 4,
    label: 'layer iv — repositories',
    gaugeLabel: 'L-IV · REPOSITORIES',
    alignment: 'left',
    title: () => 'layer iv — repositories',
    subtitle: 'everything saved, kept, remembered.',
    meta: (ctx) => `iv · repositories · ${ctx.repositoriesCount}`,
    countKey: 'repositoriesCount',
  },
  {
    id: 5,
    label: 'layer v — data',
    gaugeLabel: 'L-V · DATA',
    alignment: 'right',
    title: () => 'layer v — data',
    subtitle: 'the shape of what flows through.',
    meta: (ctx) => `v · data · ${ctx.dataCount}`,
    countKey: 'dataCount',
  },
  {
    id: 6,
    label: 'layer vi — external',
    gaugeLabel: 'L-VI · EXTERNAL',
    alignment: 'left',
    title: () => 'layer vi — external',
    subtitle: "everything above stands on code you didn't write.",
    meta: (ctx) => `vi · external · ${ctx.librariesCount}`,
    countKey: 'librariesCount',
  },
  {
    id: 7,
    label: 'arrival',
    gaugeLabel: 'ARRIVAL',
    alignment: 'center',
    title: () => 'start with the heart.',
    meta: (ctx) => `${ctx.godClassName.toLowerCase()} — ${ctx.godClassOutDegree} outgoing dependencies`,
    buttonText: 'enter the codebase',
    countKey: 'godClassOutDegree',
  },
];

export const HOSPITAL_BEATS: BeatDefinition[] = [
  {
    id: 0,
    label: 'surface',
    gaugeLabel: 'SURFACE',
    alignment: 'left',
    title: () => 'cortex',
    subtitle: 'clinical graph · hospital',
    meta: (ctx) => `${ctx.entitiesCount} entities · ${ctx.relationshipsCount} relationships · healthcare emr`,
    cue: 'scroll to descend',
  },
  {
    id: 1,
    label: 'layer i — patients',
    gaugeLabel: 'L-I · PATIENTS',
    alignment: 'right',
    title: () => 'layer i — patients',
    subtitle: 'admissions, histories, and clinical records.',
    meta: (ctx) => `i · patients · ${ctx.patientsCount ?? 0}`,
    countKey: 'patientsCount',
  },
  {
    id: 2,
    label: 'layer ii — prescriptions',
    gaugeLabel: 'L-II · RX',
    alignment: 'left',
    title: () => 'layer ii — prescriptions',
    subtitle: 'active orders linking patients to pharmaceutical care.',
    meta: (ctx) => `ii · prescriptions · ${ctx.prescriptionsCount ?? 0}`,
    countKey: 'prescriptionsCount',
  },
  {
    id: 3,
    label: 'layer iii — medications',
    gaugeLabel: 'L-III · DRUGS',
    alignment: 'right',
    title: () => 'layer iii — medications',
    subtitle: 'pharmaceutical entities, contraindications, and conflict edges.',
    meta: (ctx) => `iii · medications · ${ctx.medicationsCount ?? 0}`,
    countKey: 'medicationsCount',
  },
  {
    id: 4,
    label: 'arrival',
    gaugeLabel: 'ARRIVAL',
    alignment: 'center',
    title: () => 'start with the patient.',
    meta: (ctx) => `${ctx.godClassName.toLowerCase()} — ${ctx.godClassOutDegree} active links`,
    buttonText: 'enter clinical graph',
    countKey: 'godClassOutDegree',
  },
];

export interface StratumTemplate {
  name: string;
  shortGaugeLabel: string;
  subtitle: string;
  countKey?: string;
}

export const STRATUM_TEMPLATES: Record<number, StratumTemplate> = {
  0: {
    name: 'controllers',
    shortGaugeLabel: 'CONTROLLERS',
    subtitle: 'every request enters here.',
    countKey: 'controllersCount',
  },
  1: {
    name: 'services',
    shortGaugeLabel: 'SERVICES',
    subtitle: 'the work gets done here.',
    countKey: 'servicesCount',
  },
  2: {
    name: 'components',
    shortGaugeLabel: 'COMPONENTS',
    subtitle: 'mappers · handlers · guards.',
    countKey: 'componentsCount',
  },
  3: {
    name: 'repositories',
    shortGaugeLabel: 'REPOSITORIES',
    subtitle: 'everything saved, kept, remembered.',
    countKey: 'repositoriesCount',
  },
  4: {
    name: 'data',
    shortGaugeLabel: 'DATA',
    subtitle: 'the shape of what flows through.',
    countKey: 'dataCount',
  },
  5: {
    name: 'config',
    shortGaugeLabel: 'CONFIG',
    subtitle: 'wiring, properties, and runtime environment.',
  },
  6: {
    name: 'unclassified',
    shortGaugeLabel: 'UNCLASSIFIED',
    subtitle: 'internal logic, utilities, and orphaned structures.',
  },
  7: {
    name: 'external',
    shortGaugeLabel: 'EXTERNAL',
    subtitle: "everything above stands on code you didn't write.",
    countKey: 'librariesCount',
  },
};

export const HOSPITAL_STRATUM_TEMPLATES: Record<number, StratumTemplate> = {
  0: {
    name: 'patients',
    shortGaugeLabel: 'PATIENTS',
    subtitle: 'admissions, histories, and clinical records.',
    countKey: 'patientsCount',
  },
  1: {
    name: 'prescriptions',
    shortGaugeLabel: 'RX',
    subtitle: 'active orders linking patients to pharmaceutical care.',
    countKey: 'prescriptionsCount',
  },
  2: {
    name: 'medications',
    shortGaugeLabel: 'DRUGS',
    subtitle: 'pharmaceutical entities, contraindications, and conflict edges.',
    countKey: 'medicationsCount',
  },
};

export interface StratumBeatInput {
  stratumIndex: number;
  label: string;
  nodeCount: number;
}

export function generateBeats(
  adapter: string = 'vaultx',
  strataMeta?: StratumBeatInput[],
  projectName?: string
): BeatDefinition[] {
  if (adapter === 'vaultx') {
    return VAULTX_BEATS;
  }
  if (adapter === 'hospital') {
    return HOSPITAL_BEATS;
  }

  const activeStrata = strataMeta || [];
  const beats: BeatDefinition[] = [];

  // Surface beat: Beat 0
  beats.push({
    id: 0,
    label: 'surface',
    gaugeLabel: 'SURFACE',
    alignment: 'left',
    title: () => 'cortex',
    subtitle: (ctx) => `codebase intelligence · ${ctx.projectName || projectName || 'custom'}`,
    meta: (ctx) => `${ctx.entitiesCount} entities · ${ctx.relationshipsCount} relationships · one codebase`,
    cue: 'scroll to descend',
  });

  // Intermediate beats: one per non-empty stratum
  activeStrata.forEach((stratum, idx) => {
    const k = idx + 1;
    const roman = getStratumRoman(idx);
    const template = STRATUM_TEMPLATES[stratum.stratumIndex] || {
      name: stratum.label.toLowerCase(),
      shortGaugeLabel: stratum.label.toUpperCase(),
      subtitle: 'structural tier of the system.',
    };

    const techName = template.name;
    const countKey = template.countKey;

    beats.push({
      id: k,
      label: `layer ${roman} — ${techName}`,
      gaugeLabel: `L-${roman.toUpperCase()} · ${template.shortGaugeLabel}`,
      alignment: idx % 2 === 0 ? 'right' : 'left',
      title: () => `layer ${roman} — ${techName}`,
      subtitle: template.subtitle,
      meta: (ctx) => {
        const count = countKey && (ctx as any)[countKey] !== undefined
          ? (ctx as any)[countKey]
          : stratum.nodeCount;
        return `${roman} · ${techName} · ${count}`;
      },
      countKey: countKey,
      stratumIndex: stratum.stratumIndex,
    });
  });

  // Arrival beat
  const arrivalId = activeStrata.length + 1;
  beats.push({
    id: arrivalId,
    label: 'arrival',
    gaugeLabel: 'ARRIVAL',
    alignment: 'center',
    title: () => 'start with the heart.',
    meta: (ctx) => `${ctx.godClassName.toLowerCase()} — ${ctx.godClassOutDegree} outgoing dependencies`,
    buttonText: 'enter the codebase',
    countKey: 'godClassOutDegree',
  });

  return beats;
}

export function getBeats(
  adapter: string = 'vaultx',
  strataMeta?: StratumBeatInput[],
  projectName?: string
): BeatDefinition[] {
  return generateBeats(adapter, strataMeta, projectName);
}

export const BEATS = VAULTX_BEATS;
