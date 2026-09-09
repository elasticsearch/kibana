/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import type { SearchHit } from '@kbn/es-types';

import type { FleetServerAgentComponent, OutputMap } from '../../../common/types';
import { removeVersionSuffixFromPolicyId } from '../../../common/services/version_specific_policies_utils';

import { appContextService } from '..';

import type { Agent, AgentSOAttributes, AgentStatus, FleetServerAgent } from '../../types';

type FleetServerAgentESResponse =
  | estypes.GetGetResult<FleetServerAgent>
  | estypes.SearchResponse<FleetServerAgent>['hits']['hits'][0]
  | SearchHit<FleetServerAgent>;

export function searchHitToAgent(
  hit: FleetServerAgentESResponse & {
    sort?: SortResults;
    fields?: { status?: AgentStatus[]; pipeline_config?: string[]; signals?: string[] };
  },
  options?: { requireStatusRuntimeField?: boolean }
): Agent {
  const outputs: OutputMap | undefined = hit._source?.outputs
    ? Object.entries(hit._source?.outputs).reduce((acc, [key, val]) => {
        acc[key] = {
          api_key_id: val.api_key_id,
          type: val.type,
          to_retire_api_key_ids: val.to_retire_api_key_ids
            ? val.to_retire_api_key_ids.map((item) => ({
                id: item.id,
                retired_at: item.retired_at,
              }))
            : undefined,
        };
        return acc;
      }, {} as OutputMap)
    : undefined;
  const components: FleetServerAgentComponent[] | undefined = Array.isArray(hit._source?.components)
    ? hit._source?.components.map((component) => ({
        id: component.id,
        type: component.type,
        status: component.status,
        message: component.message,
        units: component.units?.map((unit) => ({
          id: unit.id,
          type: unit.type,
          status: unit.status,
          message: unit.message,
          // key-value pairs
          payload: unit.payload,
        })),
      }))
    : undefined;
  const agent: Agent = {
    id: hit._id!,
    type: hit._source?.type!,
    namespaces: hit._source?.namespaces,
    active: hit._source?.active!,
    enrolled_at: hit._source?.enrolled_at!,
    unenrolled_at: hit._source?.unenrolled_at!,
    unenrollment_started_at: hit._source?.unenrollment_started_at,
    audit_unenrolled_reason: hit._source?.audit_unenrolled_reason!,
    upgraded_at: hit._source?.upgraded_at,
    upgrade_started_at: hit._source?.upgrade_started_at,
    upgrade_details: hit._source?.upgrade_details,
    upgrade_attempts: hit._source?.upgrade_attempts,
    access_api_key_id: hit._source?.access_api_key_id,
    default_api_key_id: hit._source?.default_api_key_id,
    policy_id: hit._source?.policy_id,
    // Always resolved to the base policy id, so consumers indexing base-id-keyed collections can
    // read this field directly instead of stripping the suffix off `policy_id` themselves. The
    // fallback covers documents that pre-date `policy_base_id` (agents enrolled via an older
    // fleet-server during a mixed-version rollout, before the startup backfill catches them).
    policy_base_id:
      hit._source?.policy_base_id ??
      (hit._source?.policy_id ? removeVersionSuffixFromPolicyId(hit._source.policy_id) : undefined),
    last_checkin: hit._source?.last_checkin,
    last_checkin_status:
      hit._source?.last_checkin_status?.toLowerCase() as Agent['last_checkin_status'],
    last_checkin_message: hit._source?.last_checkin_message,
    policy_revision: hit._source?.policy_revision_idx,
    packages: hit._source?.packages ?? [],
    sort: hit.sort,
    tags: hit._source?.tags,
    outputs,
    components,
    default_api_key_history: hit._source?.default_api_key_history
      ? hit._source?.default_api_key_history.map((item) => ({
          id: item.id,
          retired_at: item.retired_at,
        }))
      : undefined,
    agent: hit._source?.agent
      ? {
          id: hit._source?.agent.id,
          version: hit._source?.agent.version,
          type: hit._source?.agent.type,
        }
      : undefined,

    // key-value pairs
    user_provided_metadata: hit._source?.user_provided_metadata!,
    local_metadata: hit._source?.local_metadata!,
    unhealthy_reason: hit._source?.unhealthy_reason,
    last_known_status: hit._source?.last_known_status,
    upgrade: hit._source?.upgrade,
    identifying_attributes: hit._source?.identifying_attributes,
    non_identifying_attributes: hit._source?.non_identifying_attributes,
    sequence_num: hit._source?.sequence_num,
    capabilities: hit._source?.capabilities,
    health: hit._source?.health,
  };

  if (hit.fields?.status?.length) {
    agent.status = hit.fields.status[0];
  } else if (options?.requireStatusRuntimeField !== false) {
    appContextService
      .getLogger()
      .error(
        'Agent status runtime field is missing, unable to get agent status for agent ' + agent.id
      );
  }
  if (hit.fields?.pipeline_config?.length) {
    agent.pipeline_config = hit.fields.pipeline_config[0];
  }
  if (hit.fields?.signals?.length) {
    agent.signals = hit.fields.signals;
  }
  return agent;
}

export function agentSOAttributesToFleetServerAgentDoc(
  data: Partial<AgentSOAttributes>
): Partial<Omit<FleetServerAgent, 'id'>> {
  const { policy_revision: policyRevison, ...rest } = data;

  const doc: Partial<Omit<FleetServerAgent, 'id'>> = { ...rest };

  if (policyRevison !== undefined) {
    doc.policy_revision_idx = policyRevison;
  }

  if (!doc.updated_at) {
    doc.updated_at = new Date().toISOString();
  }

  return doc;
}
