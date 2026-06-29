/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Converts flat synthtrace ApmFields[] into the GET /internal/apm/services response shape. */

import type { ApmFields } from '@kbn/synthtrace-client';
import type { AgentName } from '../../../../typings/es_schemas/ui/fields/agent';
import type { APIReturnType } from '../../../services/rest/create_call_apm_api';
import { SCENARIO_START, SCENARIO_END } from '../scenarios/opbeans';

type ServiceInventoryResponse = APIReturnType<'GET /internal/apm/services'>;

const SCENARIO_DURATION_MINUTES = (SCENARIO_END.getTime() - SCENARIO_START.getTime()) / 60_000;

export function toServiceInventoryResponse(docs: ApmFields[]): ServiceInventoryResponse {
  const txns = docs.filter((d) => d['processor.event'] === 'transaction');

  if (txns.length === 0) {
    return { items: [], maxCountExceeded: false, serviceOverflowCount: 0 };
  }

  const byService = new Map<string, ApmFields[]>();
  for (const t of txns) {
    const sn = t['service.name'] as string;
    if (!byService.has(sn)) byService.set(sn, []);
    byService.get(sn)!.push(t);
  }

  const items = [...byService.entries()].map(([serviceName, serviceTxns]) => {
    const totalDurationUs = serviceTxns.reduce(
      (sum, t) => sum + ((t['transaction.duration.us'] as number) ?? 0),
      0
    );
    const latency = serviceTxns.length > 0 ? totalDurationUs / serviceTxns.length : null;

    const failed = serviceTxns.filter((t) => t['event.outcome'] === 'failure').length;
    const transactionErrorRate = serviceTxns.length > 0 ? failed / serviceTxns.length : undefined;

    const throughput = serviceTxns.length / SCENARIO_DURATION_MINUTES;

    const first = serviceTxns[0];
    const envRaw = first['service.environment'] as string | undefined;
    const environments = envRaw ? [envRaw] : [];

    return {
      serviceName,
      transactionType: first['transaction.type'] as string | undefined,
      agentName: first['agent.name'] as AgentName | undefined,
      environments,
      latency,
      transactionErrorRate,
      throughput,
    };
  });

  return { items, maxCountExceeded: false, serviceOverflowCount: 0 };
}
