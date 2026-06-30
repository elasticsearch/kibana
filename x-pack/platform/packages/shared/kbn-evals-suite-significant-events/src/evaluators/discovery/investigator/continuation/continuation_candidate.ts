/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Discovery } from '@kbn/significant-events-schema';

export interface ToContinuationCandidateParams {
  /** A discovery the agent produced in a prior cycle. */
  discovery: Partial<Discovery>;
  /** Id stamped onto the candidate (agent output carries none; `clearance` needs it). */
  discoveryId: string;
}

/** Map a produced discovery into the `## Continuation Candidates` shape; stamps `discovery_id`, derives `stream_names`. */
export function toContinuationCandidate({
  discovery,
  discoveryId,
}: ToContinuationCandidateParams): Partial<Discovery> {
  const detections = discovery.detections ?? [];
  const streamNames = [
    ...new Set(
      detections
        .map((detection) => detection.stream_name)
        .filter((name): name is string => Boolean(name))
    ),
  ];

  return {
    kind: discovery.kind ?? 'discovery',
    discovery_id: discoveryId,
    discovery_slug: discovery.discovery_slug,
    detections,
    summary: discovery.summary,
    root_cause: discovery.root_cause,
    title: discovery.title,
    confidence: discovery.confidence,
    criticality: discovery.criticality,
    cause_kis: discovery.cause_kis,
    stream_names: streamNames,
    dependency_edges: discovery.dependency_edges,
    infra_components: discovery.infra_components,
  };
}

/** Collapse produced discoveries to one candidate per `discovery_slug` (latest wins); slugless skipped. */
export function mergeContinuationCandidates(
  candidates: Array<Partial<Discovery>>
): Array<Partial<Discovery>> {
  const latestBySlug = new Map<string, Partial<Discovery>>();
  for (const candidate of candidates) {
    if (candidate.discovery_slug) {
      latestBySlug.set(candidate.discovery_slug, candidate);
    }
  }
  return [...latestBySlug.values()];
}
