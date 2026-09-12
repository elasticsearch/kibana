/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import type { StartServicesAccessor } from '@kbn/core/server';
import { z } from '@kbn/zod/v4';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import { policyIdentifierInputSchema } from '../domain/input_schemas';
import type { PolicyRolloutStatus } from '../services/read_policy_rollout_status';
import { createPolicyTool } from './create_policy_tool';
import {
  presentBoundedIdentityStrings,
  presentWithinGuardedBudget,
  type PresentedPolicyIdentity,
} from './trim_policy_result';

export const GET_POLICY_ROLLOUT_STATUS_TOOL_ID =
  'security.policy_management.get_policy_rollout_status';

const GET_POLICY_ROLLOUT_STATUS_MAX_RESULT_TOKENS = 8_000;

export const getPolicyRolloutStatusSchema = z.object({
  idOrName: policyIdentifierInputSchema.describe(
    'Saved-object id or exact endpoint policy name in the current space.'
  ),
});

export interface PolicyRolloutStatusResult extends Record<string, unknown> {
  policy: PresentedPolicyIdentity<PolicyRolloutStatus['policy']>;
  spaceId: string;
  revision_coverage: {
    out_of_date_hosts: number;
    classified_hosts: number;
    undetermined_hosts: number;
    unclassified_overflow_hosts: number;
    truncated: boolean;
    source: string;
    population: string;
  };
  current_revision_responses: {
    needs_attention_hosts: number;
    classified_hosts: number;
    undetermined_hosts: number;
    upstream_unclassified_hosts: number;
    truncated: boolean;
    source: string;
    population: string;
    response_coverage_incomplete: boolean;
  };
}

const presentRolloutStatusPolicy = (policy: PolicyRolloutStatus['policy']) =>
  presentBoundedIdentityStrings({
    id: policy.id,
    name: policy.name,
    revision: policy.revision,
  });

const presentPolicyRolloutStatus = (status: PolicyRolloutStatus): PolicyRolloutStatusResult => {
  const presented: PolicyRolloutStatusResult = {
    policy: presentRolloutStatusPolicy(status.policy),
    spaceId: status.spaceId,
    revision_coverage: {
      out_of_date_hosts: status.revisionCoverage.outOfDateHosts,
      classified_hosts: status.revisionCoverage.classifiedHosts,
      undetermined_hosts: status.revisionCoverage.undeterminedHosts,
      unclassified_overflow_hosts: status.revisionCoverage.unclassifiedOverflowHosts,
      truncated: status.revisionCoverage.truncated,
      source: status.revisionCoverage.source,
      population: status.revisionCoverage.population,
    },
    current_revision_responses: {
      needs_attention_hosts: status.currentRevisionResponses.needsAttentionHosts,
      classified_hosts: status.currentRevisionResponses.classifiedHosts,
      undetermined_hosts: status.currentRevisionResponses.undeterminedHosts,
      upstream_unclassified_hosts: status.currentRevisionResponses.upstreamUnclassifiedHosts,
      truncated: status.currentRevisionResponses.truncated,
      source: status.currentRevisionResponses.source,
      population: status.currentRevisionResponses.population,
      response_coverage_incomplete: status.currentRevisionResponses.responseCoverageIncomplete,
    },
  };

  return presented;
};

export const createGetPolicyRolloutStatusTool = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): BuiltinSkillBoundedTool<typeof getPolicyRolloutStatusSchema> =>
  createPolicyTool({
    endpointAppContextService,
    getStartServices,
    id: GET_POLICY_ROLLOUT_STATUS_TOOL_ID,
    description:
      'Get current assigned-versus-applied rollout status for one Elastic Defend endpoint policy by saved-object id or exact name in the current space. ' +
      'Returns two grouped populations. revision_coverage counts readable united endpoint hosts whose canonical assignment id matches this policy\u2019s current ' +
      'agent-policy ids on the request-scoped CPS/CCS surface and reports out_of_date_hosts at an older revision. current_revision_responses counts latest policy ' +
      'responses for the bounded assignment-matched agents at the current package revision and reports needs_attention_hosts whose actions have failure or warning status. ' +
      'classified_hosts contains only hosts whose result can be decided. ' +
      'undetermined_hosts counts hosts whose required evidence is missing or invalid and must be copied as returned, including zero; ' +
      'do not convert undetermined_hosts to healthy, out-of-date, failing, or needs-attention counts. ' +
      'response_coverage_incomplete is true when the latest policy-response search did not cover every cluster that contributed United hosts; zero needs_attention_hosts applies only to the assignment-matched agents and available response evidence; ' +
      'copy it as returned, including false. Do not treat zero needs_attention_hosts as complete when response_coverage_incomplete is true. ' +
      'It is not overflow (truncated) and not per-hit invalid evidence (undetermined_hosts). ' +
      'policy.id is the stable value to pass to a later idOrName call. ' +
      'A name accompanied by name_string_truncated: true is display-only and is not an exact stored name. ' +
      'Classified or assignment-matched hosts are not enrolled-agent usage evidence and cannot answer used or unused. ' +
      'The upstream_unclassified_hosts field is unclassified truncation and must not be added or treated as out-of-date, needs-attention, or undetermined hosts. ' +
      'This is a current status read, not rollout planning and not failed-host diagnosis. Does not write policies.',
    schema: getPolicyRolloutStatusSchema,
    maxResultTokens: GET_POLICY_ROLLOUT_STATUS_MAX_RESULT_TOKENS,
    run: async ({ idOrName }: z.infer<typeof getPolicyRolloutStatusSchema>, service) => {
      const status = await service.getPolicyRolloutStatus({ idOrName });
      const presented = presentPolicyRolloutStatus(status);

      return presentWithinGuardedBudget(
        () => presented,
        GET_POLICY_ROLLOUT_STATUS_MAX_RESULT_TOKENS,
        () => presented
      );
    },
  });
