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

export function getBeats(adapter: string = 'vaultx'): BeatDefinition[] {
  if (adapter === 'hospital') {
    return HOSPITAL_BEATS;
  }
  return VAULTX_BEATS;
}

export const BEATS = VAULTX_BEATS;
