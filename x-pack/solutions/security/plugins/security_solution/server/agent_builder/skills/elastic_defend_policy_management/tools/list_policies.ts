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
import { createPolicyTool } from './create_policy_tool';
import type {
  ListPoliciesResult,
  ListedPolicyItem,
} from '../services/endpoint_policy_management_service';
import { omitTrailingToFit, toPresentationHash } from './trim_policy_result';

export const LIST_POLICIES_TOOL_ID = 'security.policy_management.list_policies';

const LIST_PAGE_MIN = 1;
const LIST_PAGE_MAX = 10_000;
const LIST_PER_PAGE_MIN = 1;
const LIST_PER_PAGE_MAX = 50;
const LIST_PER_PAGE_DEFAULT = 20;
const LIST_POLICIES_MAX_RESULT_TOKENS = 8_000;

export const listPoliciesSchema = z.object({
  page: z
    .number()
    .int()
    .min(LIST_PAGE_MIN)
    .max(LIST_PAGE_MAX)
    .default(LIST_PAGE_MIN)
    .describe(
      '1-based page of endpoint package policies in the current space (1–10000, default 1).'
    ),
  perPage: z
    .number()
    .int()
    .min(LIST_PER_PAGE_MIN)
    .max(LIST_PER_PAGE_MAX)
    .default(LIST_PER_PAGE_DEFAULT)
    .describe(
      'Page size (1–50, default 20). Usage and enrolled-agent counts are returned only in usage mode under endpoint-list read.'
    ),
  includeEndpointUsage: z
    .boolean()
    .default(false)
    .describe(
      'When true, return per-policy enrolled-agent-backed usage classification. Requires endpoint-list read.'
    ),
});

type PresentedListPolicies = ListPoliciesResult & {
  items_total?: number;
  items_truncated?: true;
};

const presentListPolicyItem = (item: ListedPolicyItem): ListedPolicyItem => ({
  ...item,
  normalizedHash: toPresentationHash(item.normalizedHash),
});

const presentListPolicies = (dto: ListPoliciesResult): PresentedListPolicies => {
  const presentedItems = dto.items.map(presentListPolicyItem);

  return omitTrailingToFit(
    (keep): PresentedListPolicies => ({
      ...dto,
      items: presentedItems.slice(0, keep),
      ...(keep < presentedItems.length
        ? { items_total: presentedItems.length, items_truncated: true as const }
        : {}),
    }),
    presentedItems.length,
    LIST_POLICIES_MAX_RESULT_TOKENS
  );
};

export const createListPoliciesTool = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): BuiltinSkillBoundedTool<typeof listPoliciesSchema> =>
  createPolicyTool({
    endpointAppContextService,
    getStartServices,
    id: LIST_POLICIES_TOOL_ID,
    description:
      'List Elastic Defend endpoint policies in the current space as a bounded page of identity, ' +
      'normalized hash, and compact posture. Each item id is the reusable identifier for later get, compare, rollout status, or assess calls. A name with name_string_truncated true is display-only and is not an exact stored name. Usage and enrolled-agent counts are returned only in usage mode under endpoint-list read. Does not write policies.',
    schema: listPoliciesSchema,
    maxResultTokens: LIST_POLICIES_MAX_RESULT_TOKENS,
    run: async (
      { page, perPage, includeEndpointUsage }: z.infer<typeof listPoliciesSchema>,
      service
    ) => presentListPolicies(await service.listPolicies({ page, perPage, includeEndpointUsage })),
  });
