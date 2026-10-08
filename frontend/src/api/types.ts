export interface NodeDto {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  properties?: Record<string, any>;
  createdAt?: string;
}

export interface EdgeDto {
  id?: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  confidence?: number;
  evidenceRef?: string;
  metadata?: Record<string, any>;
}

export interface GraphResponse {
  nodes: NodeDto[];
  edges: EdgeDto[];
}

export interface EntityRelationshipDto {
  relationshipType: string;
  direction: 'incoming' | 'outgoing';
  node: NodeDto;
}

export interface EntityDetailResponse {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  properties?: Record<string, any>;
  relationships?: EntityRelationshipDto[];
  createdAt?: string;
}

export interface AdapterDescriptor {
  id: string;
  name: string;
  description?: string;
  supportedDomain?: string;
}

export interface IngestResponse {
  adapter?: string;
  entityCount?: number;
  entitiesIngested?: number;
  relationshipsIngested?: number;
  eventsIngested?: number;
  message?: string;
}

export interface PathNodeDto {
  id: string;
  nodeId?: string;
  entityId: string;
  entityName: string;
  entityType: string;
  properties?: Record<string, any>;
}

export interface PathEdgeDto {
  id: string;
  edgeId?: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  confidence?: number;
  evidenceRef?: string;
  metadata?: Record<string, any>;
}

export interface PathResponse {
  found: boolean;
  from: string;
  to: string;
  depth: number;
  nodes: PathNodeDto[];
  edges: PathEdgeDto[];
  message?: string;
}

export interface DependentItemDto {
  id: string;
  nodeId?: string;
  entityId: string;
  entityName: string;
  entityType: string;
  depth: number;
  relationshipType: string;
  edgeId?: string;
  confidence?: number;
  evidenceRef?: string;
  metadata?: Record<string, any>;
}

export interface ReverseDependencyResponse {
  entity: PathNodeDto;
  directDependents: number;
  indirectDependents: number;
  totalDependents: number;
  dependents: DependentItemDto[];
}

export interface CircularDependencyGroupDto {
  id: string;
  entityCount: number;
  size: number;
  entities: PathNodeDto[];
  edges: PathEdgeDto[];
}

export interface CircularDependencyResponse {
  totalCycles: number;
  totalCyclicEntities: number;
  circularDependencies: CircularDependencyGroupDto[];
  message?: string;
}

export interface ChangeImpactResponse {
  target: PathNodeDto;
  directImpactCount: number;
  indirectImpactCount: number;
  totalImpactCount: number;
  maxDepth: number;
  affectedControllers: number;
  affectedServices: number;
  affectedRepositories: number;
  affectedPackages: number;
  impactedByEntityType: Record<string, number>;
  inCircularDependency: boolean;
  impactedEntities: DependentItemDto[];
  message?: string;
}

export interface StreamSimulationInitResponse {
  simulationId: string;
  targetEntityId: string;
  targetStatus: string;
  wsEndpoint: string;
  status: string;
  message?: string;
}

export type ReasoningEventType =
  | 'SIMULATION_STARTED'
  | 'TARGET_FAILURE_ASSERTED'
  | 'ITERATION_STARTED'
  | 'RULE_EVALUATION'
  | 'RULE_FIRED'
  | 'FACT_ASSERTED'
  | 'PROVENANCE_RECORDED'
  | 'ITERATION_COMPLETED'
  | 'FIXPOINT_CONVERGED'
  | 'SIMULATION_COMPLETED'
  | 'SIMULATION_FAILED';

export interface ReasoningStreamEvent {
  simulationId?: string;
  sequenceNumber: number;
  eventType?: ReasoningEventType | string;
  type?: ReasoningEventType | string;
  timestamp: string;
  iteration?: number;
  message?: string;
  ruleId?: string;
  ruleName?: string;
  consumedFactIds?: string[];
  assertedFactId?: string;
  factId?: string;
  factType?: string;
  entityId?: string;
  entityName?: string;
  status?: string;
  inferred?: boolean;
  provenanceId?: string;
  totalFacts?: number;
  executionTime?: number;
  metadata?: Record<string, any>;
  data?: Record<string, any>;
}


export interface EvidenceRuleItem {
  id?: string;
  step?: string;
  rule?: string;
  ruleId?: string;
  ruleName?: string;
  description?: string;
  conditions?: string;
  relationship?: string;
  evidence_ref?: string;
  status?: string;
  action?: string;
  priority?: number;
}

export interface EvidenceResponse {
  fact?: {
    id: string;
    factType: string;
    entityId?: string;
    entityName?: string;
    factData?: Record<string, any>;
    sourceData?: any;
    inferred: boolean;
    createdAt?: string;
  };
  evidenceChain?: EvidenceRuleItem[];
  ruleFired?: {
    id?: string;
    rule_name?: string;
    condition_vocab?: any;
    action_type?: string;
    firing_order?: number;
  };
  consumedFacts?: any[];
  sourceData?: any;
}

export interface BatchReasoningResponse {
  simulationId: string;
  executionTime: number;
  facts: any[];
  rulesFired: any[];
  message?: string;
}

