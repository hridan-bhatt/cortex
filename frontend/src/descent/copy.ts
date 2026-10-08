export interface BeatDefinition {
  id: number;
  label: string;
  gaugeLabel: string;
  alignment: 'left' | 'right' | 'center';
  title: (ctx: BeatContext) => string;
  subtitle?: string;
  meta: (ctx: BeatContext) => string;
  cue?: string;
  buttonText?: string;
  countKey?: string;
}

export interface BeatContext {
  adapter: string;
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
    subtitle: 'codebase intelligence · vaultx',
    meta: (ctx) => `${ctx.entitiesCount} entities · ${ctx.relationshipsCount} relationships · one codebase`,
    cue: 'scroll to descend',
  },
  {
    id: 1,
    label: 'layer i — entry',
    gaugeLabel: 'L-I · ENTRY',
    alignment: 'right',
    title: () => 'layer i — entry',
    subtitle: 'every request enters here.',
    meta: (ctx) => `${ctx.controllersCount} controllers`,
    countKey: 'controllersCount',
  },
  {
    id: 2,
    label: 'layer ii — logic',
    gaugeLabel: 'L-II · LOGIC',
    alignment: 'left',
    title: () => 'layer ii — logic',
    subtitle: 'the work gets done here.',
    meta: (ctx) => `${ctx.servicesCount} services`,
    countKey: 'servicesCount',
  },
  {
    id: 3,
    label: 'layer iii — plumbing',
    gaugeLabel: 'L-III · PLUMBING',
    alignment: 'right',
    title: () => 'layer iii — plumbing',
    subtitle: 'mappers · handlers · guards.',
    meta: (ctx) => `${ctx.componentsCount} components`,
    countKey: 'componentsCount',
  },
  {
    id: 4,
    label: 'layer iv — persistence',
    gaugeLabel: 'L-IV · PERSISTENCE',
    alignment: 'left',
    title: () => 'layer iv — persistence',
    subtitle: 'everything saved, kept, remembered.',
    meta: (ctx) => `${ctx.repositoriesCount} repositories`,
    countKey: 'repositoriesCount',
  },
  {
    id: 5,
    label: 'layer v — structure',
    gaugeLabel: 'L-V · STRUCTURE',
    alignment: 'right',
    title: () => 'layer v — structure',
    subtitle: 'the shape of what flows through.',
    meta: (ctx) => `${ctx.dataCount} entities`,
    countKey: 'dataCount',
  },
  {
    id: 6,
    label: 'layer vi — bedrock',
    gaugeLabel: 'L-VI · BEDROCK',
    alignment: 'left',
    title: () => 'layer vi — bedrock',
    subtitle: "everything above stands on code you didn't write.",
    meta: (ctx) => `${ctx.librariesCount} libraries`,
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
    meta: (ctx) => `${ctx.patientsCount ?? 0} patients`,
    countKey: 'patientsCount',
  },
  {
    id: 2,
    label: 'layer ii — prescriptions',
    gaugeLabel: 'L-II · RX',
    alignment: 'left',
    title: () => 'layer ii — prescriptions',
    subtitle: 'active orders linking patients to pharmaceutical care.',
    meta: (ctx) => `${ctx.prescriptionsCount ?? 0} prescriptions`,
    countKey: 'prescriptionsCount',
  },
  {
    id: 3,
    label: 'layer iii — medications',
    gaugeLabel: 'L-III · DRUGS',
    alignment: 'right',
    title: () => 'layer iii — medications',
    subtitle: 'pharmaceutical entities, contraindications, and conflict edges.',
    meta: (ctx) => `${ctx.medicationsCount ?? 0} medications`,
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
