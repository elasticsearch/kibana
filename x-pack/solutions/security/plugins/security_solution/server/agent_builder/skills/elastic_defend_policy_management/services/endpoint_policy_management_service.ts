/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, StartServicesAccessor } from '@kbn/core/server';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import { EndpointAuthorizationError } from '../../../../endpoint/errors';
import {
  ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
  ENDPOINT_POLICY_READ_REQUIRED_AUTHZ,
  satisfiesEndpointAuthzRequirement,
} from '../../../../../common/endpoint/service/authz';
import type { PolicyDiffEntry } from '../domain/diff_policy_config';
import type { AssessPolicyChangeParams } from '../domain/impact';
import { diffPolicyConfig } from '../domain/diff_policy_config';
import type { AssessPolicyChangeDto } from './assess_change';
import { assessChange } from './assess_change';
import type { PolicyAccessContext } from './access_context';
import { createPolicyAccessContext } from './access_context';
import type { ClassifiedPolicyUsage } from './classify_policy_usage';
import { classifyPolicyUsage } from './classify_policy_usage';
import { countEndpoints } from './count_endpoints';
import type { FieldReferenceResult } from './field_reference';
import { lookupFieldReference } from './field_reference';
import type { PolicyRolloutStatus } from './read_policy_rollout_status';
import { readPolicyRolloutStatus } from './read_policy_rollout_status';
import type { ListPoliciesDto, ListPolicyItem } from './list_endpoint_policies';
import { listEndpointPolicies } from './list_endpoint_policies';
import type { EndpointPolicyRead } from './read_policy';
import {
  ensureResolvedInCurrentSpace,
  getEndpointPolicy,
  resolvePackagePolicy,
} from './read_policy';

const LIST_USAGE_FANOUT_MAX = 20;

export type ListedPolicyItem = ListPolicyItem & {
  usage?: ClassifiedPolicyUsage;
};

export type ListPoliciesResult = Omit<ListPoliciesDto, 'items'> & {
  items: readonly ListedPolicyItem[];
  usage_truncated?: true;
  usage_unavailable?: 'requires_endpoint_list_read';
};

export type PolicyComparison = Readonly<{
  from: EndpointPolicyRead;
  to: EndpointPolicyRead;
  diffs: readonly PolicyDiffEntry[];
}>;

export interface EndpointPolicyManagementServiceDependencies {
  readonly endpointAppContextService: EndpointAppContextService;
  readonly getStartServices: StartServicesAccessor;
  readonly request: KibanaRequest;
  readonly spaceId: string;
}

export interface EndpointPolicyManagementService {
  listPolicies(
    input: Readonly<{ page: number; perPage: number; includeEndpointUsage: boolean }>
  ): Promise<ListPoliciesResult>;
  getPolicy(reference: Readonly<{ idOrName: string }>): Promise<EndpointPolicyRead>;
  comparePolicies(
    from: Readonly<{ idOrName: string }>,
    to: Readonly<{ idOrName: string }>
  ): Promise<PolicyComparison>;
  assessPolicyChange(input: AssessPolicyChangeParams): Promise<AssessPolicyChangeDto>;
  getPolicyRolloutStatus(reference: Readonly<{ idOrName: string }>): Promise<PolicyRolloutStatus>;
  getPolicyFieldReference(input: Readonly<{ path: string }>): Promise<FieldReferenceResult>;
}

const LIST_USAGE_UNAVAILABLE = 'requires_endpoint_list_read' as const;

const attachUsage = async (
  items: readonly ListPolicyItem[],
  assignmentsById: ReadonlyMap<string, readonly string[]>,
  usageAccess: PolicyAccessContext
): Promise<Pick<ListPoliciesResult, 'items' | 'usage_truncated'>> => {
  const usageTruncated = items.length > LIST_USAGE_FANOUT_MAX;
  const classifiedHead = await Promise.all(
    items.slice(0, LIST_USAGE_FANOUT_MAX).map(async (item): Promise<ListedPolicyItem> => {
      try {
        const count = await countEndpoints(usageAccess, {
          agentPolicyIds: assignmentsById.get(item.id) ?? [],
        });
        return { ...item, usage: classifyPolicyUsage(count) };
      } catch {
        return {
          ...item,
          usage: { classification: 'undetermined', reason: 'count_unavailable' },
        };
      }
    })
  );

  const undeterminedTail = items.slice(LIST_USAGE_FANOUT_MAX).map(
    (item): ListedPolicyItem => ({
      ...item,
      usage: { classification: 'undetermined', reason: 'usage_truncated' },
    })
  );

  return {
    items: [...classifiedHead, ...undeterminedTail],
    ...(usageTruncated ? { usage_truncated: true as const } : {}),
  };
};

const toDeniedUsageItem = (item: ListPolicyItem): ListedPolicyItem => ({
  ...item,
  usage: { classification: 'undetermined', reason: LIST_USAGE_UNAVAILABLE },
});

export const createEndpointPolicyManagementService = ({
  endpointAppContextService,
  getStartServices,
  request,
  spaceId,
}: EndpointPolicyManagementServiceDependencies): EndpointPolicyManagementService => {
  const requireAccess = async (
    requiredAuthz:
      | typeof ENDPOINT_POLICY_READ_REQUIRED_AUTHZ
      | typeof ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ
  ): Promise<PolicyAccessContext> =>
    createPolicyAccessContext(
      endpointAppContextService,
      { request, spaceId },
      requiredAuthz,
      getStartServices
    );

  return {
    listPolicies: async ({ page, perPage, includeEndpointUsage }) => {
      const access = await requireAccess(ENDPOINT_POLICY_READ_REQUIRED_AUTHZ);
      const { dto, assignmentsById } = await listEndpointPolicies(access, { page, perPage });

      if (!includeEndpointUsage) {
        return dto;
      }

      let usageAccess: PolicyAccessContext;
      try {
        usageAccess = await requireAccess(ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ);
      } catch (error) {
        if (error instanceof EndpointAuthorizationError) {
          return {
            ...dto,
            items: dto.items.map(toDeniedUsageItem),
            usage_unavailable: LIST_USAGE_UNAVAILABLE,
          };
        }
        throw error;
      }

      return {
        ...dto,
        ...(await attachUsage(dto.items, assignmentsById, usageAccess)),
      };
    },

    getPolicy: async ({ idOrName }) => {
      const access = await requireAccess(ENDPOINT_POLICY_READ_REQUIRED_AUTHZ);
      return getEndpointPolicy(access, { idOrName });
    },

    comparePolicies: async (from, to) => {
      const access = await requireAccess(ENDPOINT_POLICY_READ_REQUIRED_AUTHZ);
      const [fromRead, toRead] = await Promise.all([
        getEndpointPolicy(access, { idOrName: from.idOrName }),
        getEndpointPolicy(access, { idOrName: to.idOrName }),
      ]);

      return {
        from: fromRead,
        to: toRead,
        diffs: diffPolicyConfig(fromRead.normalizedConfig, toRead.normalizedConfig),
      };
    },

    assessPolicyChange: async (input) => {
      const authz = await endpointAppContextService.getEndpointAuthz(request);
      if (
        !satisfiesEndpointAuthzRequirement(authz, ENDPOINT_POLICY_READ_REQUIRED_AUTHZ) ||
        !satisfiesEndpointAuthzRequirement(authz, ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ)
      ) {
        throw new EndpointAuthorizationError();
      }

      const access = await requireAccess(ENDPOINT_POLICY_READ_REQUIRED_AUTHZ);
      return assessChange(access, endpointAppContextService, input);
    },

    getPolicyRolloutStatus: async ({ idOrName }) => {
      const access = await requireAccess(ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ);
      const packagePolicy = await resolvePackagePolicy(access, idOrName);
      await ensureResolvedInCurrentSpace(access, packagePolicy.id);

      return readPolicyRolloutStatus(access, endpointAppContextService, { packagePolicy }, request);
    },

    getPolicyFieldReference: async ({ path }) => {
      await requireAccess(ENDPOINT_POLICY_READ_REQUIRED_AUTHZ);
      return lookupFieldReference(path);
    },
  };
};
