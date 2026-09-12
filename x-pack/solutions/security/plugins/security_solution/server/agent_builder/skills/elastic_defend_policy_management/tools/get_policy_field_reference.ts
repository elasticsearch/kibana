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
import { policyPathInputSchema } from '../domain/input_schemas';
import type { FieldReferenceResult } from '../services/field_reference';
import { createPolicyTool } from './create_policy_tool';

export type {
  ExactFieldReferenceResult,
  FieldReferenceDocumentationAvailability,
  FieldReferenceLongFormGuidance,
  FieldReferenceResult,
  OsLessRemainderFieldReferenceResult,
  PresentedFieldReferenceEntry,
  ProtectionKeyFieldReferenceResult,
  UnknownFieldReferenceResult,
} from '../services/field_reference';

export const GET_POLICY_FIELD_REFERENCE_TOOL_ID =
  'security.policy_management.get_policy_field_reference';

export const getPolicyFieldReferenceSchema = z
  .object({
    path: policyPathInputSchema.describe(
      'Exact policy path (e.g. linux.events.dns), an OS-less protection keyPath (e.g. malware.mode), or an OS-less remainder after one supported OS segment (e.g. behavior_protection.reputation_service).'
    ),
  })
  .strict();

export const createGetPolicyFieldReferenceTool = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): BuiltinSkillBoundedTool<typeof getPolicyFieldReferenceSchema> =>
  createPolicyTool({
    endpointAppContextService,
    getStartServices,
    id: GET_POLICY_FIELD_REFERENCE_TOOL_ID,
    description:
      'Look up a single Elastic Defend policy setting by exact path, OS-less protection key, or OS-less remainder. ' +
      'Lookup order is exact path, then protection key, then OS-less remainder. ' +
      'OS-less remainder matching strips exactly one leading supported-OS segment and compares the complete remainder. ' +
      'Returns derived registry facts when found, including os_less_remainder expansions, or a successful unknown_path miss. ' +
      'Found results set `documentationAvailability` to present or absent and `longFormGuidance` to not_retrieved_by_this_tool. ' +
      '`longFormGuidance` means this tool did not retrieve long-form guidance; it is not unavailable after Integration Knowledge retrieval. ' +
      'Restate `entry.documentation` only when `documentationAvailability` is present. ' +
      'Does not read or write live policies.',
    schema: getPolicyFieldReferenceSchema,
    run: async ({ path }: z.infer<typeof getPolicyFieldReferenceSchema>, service) => {
      const result: FieldReferenceResult = await service.getPolicyFieldReference({ path });
      return { ...result };
    },
  });
