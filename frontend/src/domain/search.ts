import { NodeDto } from '../api/types';
import { NodeDegrees } from './layout';

export interface SearchMatch {
  node: NodeDto;
  stratumIndex: number;
  totalDegree: number;
  matchedNameRange?: [number, number];
  matchedInProp?: string;
  score: number;
}

export interface SearchIndexEntry {
  node: NodeDto;
  stratumIndex: number;
  totalDegree: number;
  nameLower: string;
  typeLower: string;
  idLower: string;
  wordStarts: number[]; // index of word boundaries in nameLower
  propBlob: string;
}

/**
 * Find word boundaries in CamelCase, kebab-case, snake_case, dot.notation
 */
function findWordStarts(str: string): number[] {
  const starts: number[] = [0];
  for (let i = 1; i < str.length; i++) {
    const prev = str[i - 1];
    const curr = str[i];
    if (
      prev === '.' ||
      prev === '_' ||
      prev === '-' ||
      prev === '/' ||
      prev === '\\'
    ) {
      starts.push(i);
    } else if (/[a-z]/.test(prev) && /[A-Z]/.test(curr)) {
      starts.push(i);
    }
  }
  return starts;
}

/**
 * Build searchable index once per graph load.
 */
export function buildSearchIndex(
  nodes: NodeDto[],
  nodeStrata: Map<string, number>,
  degrees: Map<string, NodeDegrees>
): SearchIndexEntry[] {
  return nodes.map((node) => {
    const stratumIndex = nodeStrata.get(node.id) ?? 6;
    const totalDegree = degrees.get(node.id)?.total ?? 0;
    const nameLower = (node.entityName || '').toLowerCase();
    const typeLower = (node.entityType || '').toLowerCase();
    const idLower = (node.entityId || '').toLowerCase();

    const propValues: string[] = [];
    if (node.properties) {
      for (const val of Object.values(node.properties)) {
        if (typeof val === 'string') {
          propValues.push(val.toLowerCase());
        } else if (typeof val === 'number') {
          propValues.push(String(val));
        }
      }
    }

    return {
      node,
      stratumIndex,
      totalDegree,
      nameLower,
      typeLower,
      idLower,
      wordStarts: findWordStarts(node.entityName || ''),
      propBlob: propValues.join(' '),
    };
  });
}

/**
 * Check if query is a subsequence of target, returning score if so.
 */
function isSubsequence(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      qi++;
    }
  }
  return qi === query.length;
}

/**
 * Pure deterministic search function over pre-built index.
 * Scoring: exact prefix > word-start > substring > subsequence/prop; ties broken by degree desc, then name asc.
 */
export function searchNodes(
  index: SearchIndexEntry[],
  rawQuery: string,
  limit: number = 9
): SearchMatch[] {
  const query = rawQuery.trim().toLowerCase();

  // Empty query -> Top hubs (highest degree nodes)
  if (!query) {
    const topHubs = [...index]
      .sort((a, b) => {
        if (b.totalDegree !== a.totalDegree) return b.totalDegree - a.totalDegree;
        return a.nameLower.localeCompare(b.nameLower);
      })
      .slice(0, 6);

    return topHubs.map((e) => ({
      node: e.node,
      stratumIndex: e.stratumIndex,
      totalDegree: e.totalDegree,
      score: 1000 + e.totalDegree,
    }));
  }

  const matches: SearchMatch[] = [];

  for (const entry of index) {
    let score = 0;
    let matchedNameRange: [number, number] | undefined = undefined;
    let matchedInProp: string | undefined = undefined;

    // 1. Exact entityName prefix
    if (entry.nameLower.startsWith(query)) {
      score = 10000;
      matchedNameRange = [0, query.length];
    } else {
      // 2. Word-start match in entityName
      let wordStartFound = false;
      for (const startIdx of entry.wordStarts) {
        if (entry.nameLower.slice(startIdx).startsWith(query)) {
          score = 8000;
          matchedNameRange = [startIdx, startIdx + query.length];
          wordStartFound = true;
          break;
        }
      }

      // 3. Substring match in entityName
      if (!wordStartFound) {
        const subIdx = entry.nameLower.indexOf(query);
        if (subIdx !== -1) {
          score = 6000;
          matchedNameRange = [subIdx, subIdx + query.length];
        } else if (entry.typeLower.startsWith(query)) {
          // 4. entityType prefix
          score = 4500;
        } else if (entry.typeLower.includes(query)) {
          score = 4000;
        } else if (entry.idLower.includes(query)) {
          // 5. entityId match
          score = 3500;
        } else if (entry.propBlob.includes(query)) {
          // 6. Property value match (e.g. file_path)
          score = 3000;
          matchedInProp = 'property';
        } else if (isSubsequence(query, entry.nameLower)) {
          // 7. Subsequence in entityName
          score = 1500;
        }
      }
    }

    if (score > 0) {
      matches.push({
        node: entry.node,
        stratumIndex: entry.stratumIndex,
        totalDegree: entry.totalDegree,
        matchedNameRange,
        matchedInProp,
        score,
      });
    }
  }

  // Deterministic sort: score desc, degree desc, entityName asc
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.totalDegree !== a.totalDegree) return b.totalDegree - a.totalDegree;
    return (a.node.entityName || '').localeCompare(b.node.entityName || '');
  });

  return matches.slice(0, limit);
}
