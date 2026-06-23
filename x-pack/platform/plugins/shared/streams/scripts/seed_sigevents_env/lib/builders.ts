/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LogsManifest } from '@kbn/synthtrace/src/lib/service_graph_logs/types';
import { DEP_TO_CATEGORY } from '@kbn/synthtrace/src/lib/service_graph_logs/constants';
import type { SeedContext } from '../types';
import { deterministicId } from '../types';

const INFRA_DEP_SUBTYPE: Record<string, string> = {
  database: 'database_connection',
  message_queue: 'api_integration',
  cache: 'api_integration',
};

/**
 * Builds the canonical feature payload objects from the manifest.
 * Used by both seedFeatures (which adds index-only fields status/last_seen) and
 * buildTaskDocs in seed_tasks.ts.
 */
export function buildFeaturePayloads(
  ctx: SeedContext,
  manifest: LogsManifest
): Array<Record<string, unknown>> {
  const features: Array<Record<string, unknown>> = [];

  for (const svc of manifest.services) {
    const runtime = 'runtime' in svc ? String(svc.runtime) : 'unknown';
    const infraDeps = 'infraDeps' in svc && Array.isArray(svc.infraDeps) ? [...svc.infraDeps] : [];
    features.push({
      id: deterministicId(ctx.streamName, 'feature', 'entity', svc.name),
      uuid: deterministicId(ctx.streamName, 'feature-uuid', 'entity', svc.name),
      stream_name: ctx.streamName,
      type: 'entity',
      subtype: 'service',
      title: svc.name,
      description: `Application service ${svc.name} (${runtime}) participating in the claims pipeline.`,
      properties: { name: svc.name, runtime, infraDeps },
      confidence: 100,
      tags: ['entity', 'service'],
      evidence: [`service.name=${svc.name}`],
      evidence_doc_ids: [],
      filter: { field: 'service.name', eq: svc.name },
    });
  }

  for (const dep of manifest.activeInfraDeps) {
    const subtype = DEP_TO_CATEGORY[dep] ?? 'database';
    features.push({
      id: deterministicId(ctx.streamName, 'feature', 'infra-entity', dep),
      uuid: deterministicId(ctx.streamName, 'feature-uuid', 'infra-entity', dep),
      stream_name: ctx.streamName,
      type: 'entity',
      subtype,
      title: dep,
      description: `${subtype.replace(
        '_',
        ' '
      )} component ${dep} used by services in the claims pipeline.`,
      properties: { name: dep, technology: dep },
      confidence: 100,
      tags: ['entity', subtype],
      evidence: [`"${dep}"`],
      evidence_doc_ids: [],
    });
  }

  for (const edge of manifest.edges) {
    const key = `${edge.source}->${edge.target}`;
    const protocol = String(edge.protocol);
    const category = DEP_TO_CATEGORY[edge.target as keyof typeof DEP_TO_CATEGORY];
    const subtype =
      (category && INFRA_DEP_SUBTYPE[category as keyof typeof INFRA_DEP_SUBTYPE]) ??
      'service_dependency';

    features.push({
      id: deterministicId(ctx.streamName, 'feature', 'dependency', key),
      uuid: deterministicId(ctx.streamName, 'feature-uuid', 'dependency', key),
      stream_name: ctx.streamName,
      type: 'dependency',
      subtype,
      title: `${edge.source} → ${edge.target}`,
      description: `${protocol.toUpperCase()} ${subtype.replace('_', ' ')} from ${edge.source} to ${
        edge.target
      }.`,
      properties: { source: edge.source, target: edge.target, protocol },
      confidence: 100,
      tags: ['dependency', subtype, protocol],
      evidence: [
        `service.name=${edge.source}`,
        `peer.service=${edge.target}`,
        `network.protocol=${protocol}`,
      ],
      evidence_doc_ids: [],
    });
  }

  return features;
}
