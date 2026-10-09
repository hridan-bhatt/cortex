import {
  ChangeImpactResponse,
  CircularDependencyResponse,
  EntityDetailResponse,
  GraphResponse,
  IngestResponse,
  PathResponse,
  ReverseDependencyResponse,
  StreamSimulationInitResponse,
  EvidenceResponse,
  AdapterDescriptor,
  BatchReasoningResponse,
  RuleDto,
} from './types';

export function apiId(node: { id: string; entityId?: string }): string {
  return node.id;
}


const getBaseUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location.port !== '3000' && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
};

const BASE_URL = getBaseUrl();

export async function fetchAdapters(): Promise<AdapterDescriptor[]> {
  const response = await fetch(`${BASE_URL}/adapters`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch adapters (${response.status}): ${errorText || response.statusText}`);
  }
  return response.json();
}

export async function ingest(adapter: string, path?: string): Promise<IngestResponse> {
  const url = path
    ? `${BASE_URL}/ingest?adapter=${encodeURIComponent(adapter)}&path=${encodeURIComponent(path)}`
    : `${BASE_URL}/ingest?adapter=${encodeURIComponent(adapter)}`;
  const response = await fetch(url, {
    method: 'POST',
  });

  if (!response.ok) {
    let errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.message) {
        errorText = parsed.message;
      }
    } catch {
      // not json
    }
    throw new Error(errorText || `Ingestion failed (${response.status})`);
  }

  return response.json();
}

export async function fetchGraph(limit: number = 5000): Promise<GraphResponse> {
  const response = await fetch(`${BASE_URL}/graph?limit=${limit}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch graph (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchEntity(id: string): Promise<EntityDetailResponse> {
  const response = await fetch(`${BASE_URL}/entity/${encodeURIComponent(id)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch entity details (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchImpact(id: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/traverse/impact/${encodeURIComponent(id)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch impact (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchDependencyPath(fromId: string, toId: string): Promise<PathResponse> {
  const response = await fetch(
    `${BASE_URL}/traverse/path?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch dependency path (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchReverseDependencies(id: string): Promise<ReverseDependencyResponse> {
  const response = await fetch(`${BASE_URL}/traverse/reverse-dependencies/${encodeURIComponent(id)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch reverse dependencies (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchCircularDependencies(): Promise<CircularDependencyResponse> {
  const response = await fetch(`${BASE_URL}/traverse/circular-dependencies`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to detect circular dependencies (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchChangeImpact(id: string): Promise<ChangeImpactResponse> {
  const response = await fetch(`${BASE_URL}/traverse/change-impact/${encodeURIComponent(id)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to analyze change impact (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export function getWsUrl(wsEndpoint: string): string {
  if (wsEndpoint.startsWith('ws://') || wsEndpoint.startsWith('wss://')) {
    return wsEndpoint;
  }
  const wsBase = BASE_URL.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  const cleanEndpoint = wsEndpoint.startsWith('/') ? wsEndpoint : `/${wsEndpoint}`;
  return `${wsBase}${cleanEndpoint}`;
}

export async function startReasoningStream(
  targetFailure: string,
  intervalMs?: number
): Promise<StreamSimulationInitResponse> {
  const response = await fetch(`${BASE_URL}/reason/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetFailure,
      targetEntityId: targetFailure,
      ...(intervalMs ? { intervalMs } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start reasoning stream (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchEvidence(factId: string): Promise<EvidenceResponse> {
  const response = await fetch(`${BASE_URL}/evidence/${encodeURIComponent(factId)}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch evidence (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function runReasoningBatch(targetEntityId: string): Promise<BatchReasoningResponse> {
  const response = await fetch(`${BASE_URL}/reason`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetEntityId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to run batch reasoning (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function fetchRules(): Promise<RuleDto[]> {
  const response = await fetch(`${BASE_URL}/rules`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch rules (${response.status}): ${errorText || response.statusText}`);
  }

  return response.json();
}

