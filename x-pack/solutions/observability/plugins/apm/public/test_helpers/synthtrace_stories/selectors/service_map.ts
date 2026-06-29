/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Converts flat synthtrace ApmFields[] into ServiceMapResponse (compatible with transformToReactFlow). */

import type { AgentName } from '@kbn/apm-types';
import type { ApmFields } from '@kbn/synthtrace-client';
import type {
  ServiceMapResponse,
  ServiceMapSpan,
  ServicesResponse,
} from '../../../../common/service_map';

export function toServiceMapResponse(docs: ApmFields[]): ServiceMapResponse {
  // ── 1. Index downstream transactions by parent.id ────────────────────────────
  const txnByParentId = new Map<string, ApmFields>();
  for (const doc of docs) {
    if (doc['processor.event'] === 'transaction' && doc['parent.id']) {
      txnByParentId.set(doc['parent.id'] as string, doc);
    }
  }

  // ── 2. Build ServiceMapSpan[] from exit spans ─────────────────────────────────
  const spans: ServiceMapSpan[] = [];
  for (const doc of docs) {
    if (doc['processor.event'] !== 'span') continue;
    const resource = doc['span.destination.service.resource'];
    if (!resource) continue;

    const spanId = doc['span.id'] as string;
    const destTxn = txnByParentId.get(spanId);

    const entry: ServiceMapSpan = {
      spanId,
      serviceName: doc['service.name'] as string,
      agentName: doc['agent.name'] as AgentName,
      serviceEnvironment: (doc['service.environment'] as string | undefined) ?? undefined,
      spanType: (doc['span.type'] as string) || 'external',
      spanSubtype: (doc['span.subtype'] as string) || '',
      spanDestinationServiceResource: resource as string,
    };

    if (destTxn) {
      entry.destinationService = {
        serviceName: destTxn['service.name'] as string,
        agentName: destTxn['agent.name'] as AgentName,
        serviceEnvironment: (destTxn['service.environment'] as string | undefined) ?? undefined,
      };
    }

    spans.push(entry);
  }

  // ── 3. Build servicesData from unique transaction-level services ──────────────
  const seen = new Set<string>();
  const servicesData: ServicesResponse[] = [];
  for (const doc of docs) {
    if (doc['processor.event'] !== 'transaction') continue;
    const name = doc['service.name'] as string;
    if (seen.has(name)) continue;
    seen.add(name);
    servicesData.push({
      'service.name': name,
      'agent.name': doc['agent.name'] as string,
      'service.environment': (doc['service.environment'] as string) ?? null,
    });
  }

  // ── 4. Count root transactions (no parent.id) ─────────────────────────────────
  const tracesCount = docs.filter(
    (d) => d['processor.event'] === 'transaction' && !d['parent.id']
  ).length;

  return {
    spans,
    servicesData,
    anomalies: { mlJobIds: [], serviceAnomalies: [] },
    tracesCount,
  };
}
