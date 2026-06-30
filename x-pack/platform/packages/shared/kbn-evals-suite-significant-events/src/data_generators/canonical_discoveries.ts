/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Discovery } from '@kbn/significant-events-schema';

const CANONICAL_TIMESTAMP = '2024-01-01T00:00:00.000Z';

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const canonicalDiscoveryFromGroundTruth = ({
  streamName,
  scenarioId,
  discovery,
}: {
  streamName: string;
  scenarioId: string;
  discovery: Partial<Discovery>;
}): Discovery => {
  const detections = discovery.detections ?? [];
  const ruleNames =
    discovery.rule_names ??
    Array.from(new Set(detections.map((d) => d.rule_name).filter((n): n is string => Boolean(n))));
  const streamNames =
    discovery.stream_names ??
    Array.from(
      new Set([
        streamName,
        ...detections.map((d) => d.stream_name).filter((n): n is string => Boolean(n)),
      ])
    );

  return {
    '@timestamp': discovery['@timestamp'] ?? CANONICAL_TIMESTAMP,
    kind: discovery.kind ?? 'discovery',
    discovery_id: discovery.discovery_id ?? `${scenarioId}-canonical`,
    discovery_slug: discovery.discovery_slug ?? `${slugify(scenarioId)}__canonical`,
    rule_names: ruleNames,
    stream_names: streamNames,
    title: discovery.title ?? '',
    summary: discovery.summary ?? '',
    root_cause: discovery.root_cause ?? '',
    criticality: discovery.criticality ?? 0,
    confidence: discovery.confidence ?? 0,
    impact: discovery.impact ?? '',
    detections,
    processed: discovery.processed ?? false,
    ...(discovery.dependency_edges ? { dependency_edges: discovery.dependency_edges } : {}),
    ...(discovery.infra_components ? { infra_components: discovery.infra_components } : {}),
    ...(discovery.cause_kis ? { cause_kis: discovery.cause_kis } : {}),
    ...(discovery.evidences ? { evidences: discovery.evidences } : {}),
    ...(discovery.parent_discovery_id
      ? { parent_discovery_id: discovery.parent_discovery_id }
      : {}),
  };
};
