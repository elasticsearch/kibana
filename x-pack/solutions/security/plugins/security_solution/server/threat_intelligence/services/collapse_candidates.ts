/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intelligence/hub';
import type { TriageCandidateInput } from './triage_diamond_candidates';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CollapseReason {
  readonly report_id: string;
  readonly title: string;
  readonly collapse_reason: 'ioc_set_hash' | 'bilingual_sibling';
}

/**
 * A candidate that survives the deterministic collapse pass.
 * `collapsed_members` carries any exact duplicates folded into this entry
 * so the §6 synthesis can populate `consolidated_candidates` without paying
 * for the full text of every duplicate.
 */
export interface CollapsedCandidate extends TriageCandidateInput {
  readonly collapsed_members: readonly CollapseReason[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CollapseFieldSource {
  source?: { url?: string };
  extracted?: { ioc_set_hash?: string };
}

const fetchCollapseFields = async (
  esClient: ElasticsearchClient,
  reportIds: readonly string[]
): Promise<Map<string, { url: string | undefined; ioc_set_hash: string | undefined }>> => {
  const result = new Map<string, { url: string | undefined; ioc_set_hash: string | undefined }>();
  if (reportIds.length === 0) return result;

  const response = await esClient.search<CollapseFieldSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: reportIds.length + 5,
    query: { ids: { values: [...reportIds] } },
    _source: ['source.url', 'extracted.ioc_set_hash'],
    ignore_unavailable: true,
  });

  for (const hit of response.hits.hits) {
    if (hit._id) {
      result.set(hit._id, {
        url: hit._source?.source?.url,
        ioc_set_hash: hit._source?.extracted?.ioc_set_hash,
      });
    }
  }
  return result;
};

/**
 * Strips `_cn` / `-cn` bilingual-sibling suffixes (before optional trailing
 * slash) so that, e.g.:
 *   https://blog.xlab.qianxin.com/npm-pkg-hijack-cn/
 *   https://blog.xlab.qianxin.com/npm-pkg-hijack/
 * normalise to the same key.
 */
const normaliseSiblingUrl = (url: string): string => url.replace(/[_-]cn(\/?)$/i, '$1');

const higherRanked = (a: CollapsedCandidate, b: CollapsedCandidate): CollapsedCandidate => {
  if (b.overlap !== a.overlap) return b.overlap > a.overlap ? b : a;
  return b.score >= a.score ? b : a;
};

const mergeInto = (
  survivor: CollapsedCandidate,
  collapsed: CollapsedCandidate,
  reason: CollapseReason['collapse_reason']
): CollapsedCandidate => ({
  ...survivor,
  collapsed_members: [
    ...survivor.collapsed_members,
    { report_id: collapsed.report_id, title: collapsed.title, collapse_reason: reason },
    ...collapsed.collapsed_members,
  ],
});

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Deterministic pre-triage collapse — removes cheap / unambiguous duplicates
 * before the LLM triage pass to avoid wasting tokens on identical reports:
 *
 *   Pass 1 — exact `ioc_set_hash` collision: two candidates with the same
 *     IOC fingerprint are the same content set; keep the higher-ranked one.
 *
 *   Pass 2 — bilingual sibling URLs: vendors like QiAnXin XLab publish the
 *     same research as an English and a Chinese article (overlapping or
 *     `_cn`/`-cn` URL variants). Collapse into the base-language survivor.
 *
 * Fuzzy near-duplicate consolidation is intentionally left to the §6 synthesis
 * LLM — only exact/unambiguous cases are handled here.
 */
export const collapseCandidates = async (
  esClient: ElasticsearchClient,
  candidates: readonly TriageCandidateInput[]
): Promise<CollapsedCandidate[]> => {
  if (candidates.length === 0) return [];

  const collapseFields = await fetchCollapseFields(
    esClient,
    candidates.map((c) => c.report_id)
  );

  // Seed working map — every candidate starts with empty collapsed_members.
  const working = new Map<string, CollapsedCandidate>(
    candidates.map((c) => [c.report_id, { ...c, collapsed_members: [] }])
  );

  // ── Pass 1: exact ioc_set_hash collapse ───────────────────────────────────
  const hashGroups = new Map<string, string[]>();
  for (const [id, fields] of collapseFields) {
    const hash = fields.ioc_set_hash;
    if (hash && working.has(id)) {
      const group = hashGroups.get(hash) ?? [];
      group.push(id);
      hashGroups.set(hash, group);
    }
  }
  for (const [, ids] of hashGroups) {
    if (ids.length >= 2) {
      const group = ids
        .map((id) => working.get(id))
        .filter((c): c is CollapsedCandidate => c !== undefined);
      const survivor = group.reduce(higherRanked);
      for (const c of group) {
        if (c.report_id !== survivor.report_id) {
          const current = working.get(survivor.report_id);
          if (current !== undefined) {
            working.set(survivor.report_id, mergeInto(current, c, 'ioc_set_hash'));
          }
          working.delete(c.report_id);
        }
      }
    }
  }

  // ── Pass 2: bilingual-sibling URL collapse ─────────────────────────────────
  const urlGroups = new Map<string, string[]>();
  for (const [id, fields] of collapseFields) {
    const url = fields.url;
    if (url && working.has(id)) {
      const key = normaliseSiblingUrl(url).toLowerCase();
      const group = urlGroups.get(key) ?? [];
      group.push(id);
      urlGroups.set(key, group);
    }
  }
  for (const [normKey, ids] of urlGroups) {
    if (ids.length >= 2) {
      const group = ids
        .map((id) => working.get(id))
        .filter((c): c is CollapsedCandidate => c !== undefined);

      // Prefer the candidate whose raw URL is already the normalised form (base / English version).
      const base = group.find((c) => {
        const rawUrl = collapseFields.get(c.report_id)?.url ?? '';
        return normaliseSiblingUrl(rawUrl).toLowerCase() === normKey;
      });
      const survivor = base ?? group.reduce(higherRanked);
      for (const c of group) {
        if (c.report_id !== survivor.report_id) {
          const current = working.get(survivor.report_id);
          if (current !== undefined) {
            working.set(survivor.report_id, mergeInto(current, c, 'bilingual_sibling'));
          }
          working.delete(c.report_id);
        }
      }
    }
  }

  return [...working.values()].sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return b.score - a.score;
  });
};
