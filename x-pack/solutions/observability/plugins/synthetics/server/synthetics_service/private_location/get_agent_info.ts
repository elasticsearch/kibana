/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SyntheticsServerSetup } from '../../types';
import { isEqlSafeLiteral } from './assign_by_condition';

const BYTES_PER_MIB = 1024 * 1024;

export interface AgentInfo {
  /** `last_checkin` as epoch ms. Agents with no parseable check-in are omitted. */
  lastCheckin: number;
  /**
   * Total host RAM (MiB) from agent metadata (`host.memory`), or null when the
   * agent doesn't report it. Feeds capacity-aware placement so bigger agents
   * take proportionally more load; unknown hosts fall back to the mean capacity
   * in the balancer (see `makeCapacityOf` in `assign_shards.ts`).
   */
  memoryMib: number | null;
}

interface AgentLocalMetadata {
  host?: { memory?: number };
}

/**
 * Per enrolled agent (for a single location's agent policy), keyed by Fleet
 * `agent.id` — the shard key production pins monitors on. Captures each agent's
 * freshest `last_checkin` (health signal) and total host RAM (capacity). Agents
 * with no parseable check-in, or an id that can't be embedded in an Elastic
 * Agent condition, are omitted (they can never be a valid shard target).
 *
 * Paginated: a location's single agent policy can hold more than one page of
 * agents, and dropping the overflow would silently exclude them as shard targets
 * and from health/capacity. Bounded on Fleet's `total` with a hard page cap so a
 * misbehaving paginator can't spin forever; stays within ES's default 10k
 * `from + size` window. `showInactive: false` lets Fleet drop long-unenrolled
 * agents, but its ~6-min inactivity threshold is far looser than our staleness
 * window, so health detection stays the caller's responsibility.
 */
export const getAgentInfo = async (
  server: SyntheticsServerSetup,
  agentPolicyId: string,
  signal: AbortSignal
): Promise<Map<string, AgentInfo>> => {
  const byAgentId = new Map<string, AgentInfo>();

  const perPage = 1000;
  const MAX_PAGES = 10;
  let page = 1;
  let total = Infinity;
  let fetched = 0;

  while (fetched < total && page <= MAX_PAGES) {
    signal.throwIfAborted();
    const { agents, total: totalAgents } =
      await server.fleet.agentService.asInternalUser.listAgents({
        showInactive: false,
        perPage,
        page,
        kuery: `policy_id:"${agentPolicyId}"`,
        includeStatusRuntimeField: false,
      });

    if (agents.length === 0) {
      break;
    }
    total = totalAgents ?? agents.length;

    for (const agent of agents) {
      // An id that can't be stamped into a condition would throw while building
      // rebalance updates (aborting the whole location), so drop it here.
      if (!agent.id || !isEqlSafeLiteral(agent.id)) {
        continue;
      }
      const last = agent.last_checkin ? Date.parse(agent.last_checkin) : NaN;
      if (Number.isNaN(last)) {
        continue;
      }
      const host = (agent.local_metadata as AgentLocalMetadata | undefined)?.host;
      const memoryMib =
        typeof host?.memory === 'number' && host.memory > 0
          ? Math.round(host.memory / BYTES_PER_MIB)
          : null;

      byAgentId.set(agent.id, { lastCheckin: last, memoryMib });
    }

    fetched += agents.length;
    page += 1;
  }

  return byAgentId;
};
