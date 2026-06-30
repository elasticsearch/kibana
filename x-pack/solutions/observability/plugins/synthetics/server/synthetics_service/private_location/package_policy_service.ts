/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NewPackagePolicyWithId } from '@kbn/fleet-plugin/server/services/package_policy';
import type { UpdatePackagePolicyWithId } from '@kbn/fleet-plugin/common';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { ALL_SPACES_ID } from '@kbn/spaces-plugin/common/constants';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import { uniqBy } from 'lodash';
import type { SyntheticsServerSetup } from '../../types';

export class PackagePolicyService {
  private readonly server: SyntheticsServerSetup;

  constructor(_server: SyntheticsServerSetup) {
    this.server = _server;
  }

  private getSpaceSoClient(spaceId: string) {
    return this.server.coreStart.savedObjects
      .getUnsafeInternalClient()
      .asScopedToNamespace(spaceId);
  }

  private getInternalEsClient() {
    return this.server.coreStart.elasticsearch.client.asInternalUser;
  }

  async buildPackagePolicyFromPackage({ spaceId }: { spaceId: string }) {
    return this.server.fleet.packagePolicyService.buildPackagePolicyFromPackage(
      this.getSpaceSoClient(spaceId),
      'synthetics',
      {
        logger: this.server.logger,
        installMissingPackage: true,
      }
    );
  }

  async inspect({
    spaceId,
    packagePolicy,
  }: {
    spaceId: string;
    packagePolicy: NewPackagePolicyWithId;
  }) {
    return this.server.fleet.packagePolicyService.inspect(
      this.getSpaceSoClient(spaceId),
      packagePolicy
    );
  }

  async getByIds({
    spaceId,
    packagePolicyIds,
    additionalSpaceIds,
  }: {
    spaceId: string;
    packagePolicyIds: string[];
    /**
     * Extra spaces to look in alongside `spaceId` (and the default space).
     * Use this when callers need a cross-space view — e.g. the monitor health
     * API, which reports on monitors that may live in any space.
     */
    additionalSpaceIds?: string[];
  }) {
    // For legacy reasons, we always include the default space in addition to
    // the request's space (older package policies were created there).
    const spaces = new Set<string>([spaceId, DEFAULT_SPACE_ID, ...(additionalSpaceIds ?? [])]);
    const clients = [...spaces].map((space) => this.getSpaceSoClient(space));

    const ids = await Promise.all(
      clients.map((soClient) =>
        this.server.fleet.packagePolicyService.getByIDs(soClient, packagePolicyIds, {
          ignoreMissing: true,
        })
      )
    );
    return uniqBy(ids.flat(), 'id');
  }

  async bulkCreate({
    newPolicies,
    spaceId,
  }: {
    newPolicies: NewPackagePolicyWithId[];
    spaceId: string;
  }) {
    if (newPolicies.length === 0) {
      return { created: [], failed: [] };
    }

    const promises = (
      await this.getDefaultAndSpacePackagePolicies({
        policies: newPolicies,
        spaceId,
      })
    ).map(({ client, policies }) =>
      this.server.fleet.packagePolicyService.bulkCreate(
        client,
        this.getInternalEsClient(),
        policies,
        {
          asyncDeploy: true,
        }
      )
    );

    const res = await Promise.all(promises);

    return {
      created: res.flatMap((r) => r.created),
      failed: res.flatMap((r) => r.failed),
    };
  }

  async bulkUpdate({
    policiesToUpdate,
    spaceId,
  }: {
    policiesToUpdate: UpdatePackagePolicyWithId[];
    spaceId: string;
  }) {
    if (policiesToUpdate.length === 0) {
      return [];
    }

    const promises = (
      await this.getDefaultAndSpacePackagePolicies({
        policies: policiesToUpdate,
        spaceId,
      })
    ).map(({ client, policies }) =>
      this.server.fleet.packagePolicyService.bulkUpdate(
        client,
        this.getInternalEsClient(),
        policies,
        {
          force: true,
          asyncDeploy: true,
        }
      )
    );

    const res = await Promise.all(promises);
    return res.flatMap((r) => r.failedPolicies);
  }

  async bulkDelete({
    policyIdsToDelete,
    spaceId,
  }: {
    policyIdsToDelete: string[];
    spaceId: string;
  }) {
    if (policyIdsToDelete.length === 0) {
      return;
    }

    const promises = (
      await this.getDefaultAndSpacePackagePolicies({
        policies: await this.getByIds({ spaceId, packagePolicyIds: policyIdsToDelete }),
        spaceId,
      })
    ).map(({ client, policies }) =>
      this.server.fleet.packagePolicyService.delete(
        client,
        this.getInternalEsClient(),
        policies.map((policy) => policy.id!),
        {
          force: true,
          asyncDeploy: true,
        }
      )
    );

    const res = await Promise.all(promises);
    return res.flat();
  }

  // The agent policies can be in the default space or the spaceId
  // This function returns the package policies that are in the spaceId and the default space and the correct saved objects client to fetch the package policies
  private async getDefaultAndSpacePackagePolicies<T extends NewPackagePolicyWithId>({
    policies,
    spaceId,
  }: {
    policies: T[];
    spaceId: string;
  }): Promise<
    {
      client: SavedObjectsClientContract;
      policies: T[];
    }[]
  > {
    const agentPolicyIds = new Set(policies.flatMap((pkgPolicy) => pkgPolicy.policy_ids));
    const defaultSpaceSoClient = this.getSpaceSoClient(DEFAULT_SPACE_ID);
    const spaceSoClient = this.getSpaceSoClient(spaceId);
    const clients = [spaceSoClient];

    if (spaceId === DEFAULT_SPACE_ID) {
      return [{ client: defaultSpaceSoClient, policies }];
    } else {
      clients.push(defaultSpaceSoClient);
    }

    const agentPolicies = (
      await Promise.all(
        clients.map((soClient) =>
          this.server.fleet.agentPolicyService.getByIds(soClient, [...agentPolicyIds], {
            ignoreMissing: true,
          })
        )
      )
    ).flat();

    const agentPolicyById = new Map(agentPolicies.map((ap) => [ap.id, ap]));
    const defaultSpacePackagePolicies: T[] = [];
    const spacePackagePolicies: T[] = [];

    for (const pkgPolicy of policies) {
      if (pkgPolicy.policy_ids) {
        pkgPolicy.policy_ids?.forEach((policyId) => {
          const agentPolicy = agentPolicyById.get(policyId);
          if (
            agentPolicy?.space_ids?.includes(spaceId) ||
            agentPolicy?.space_ids?.includes(ALL_SPACES_ID)
          ) {
            spacePackagePolicies.push(pkgPolicy);
          } else {
            defaultSpacePackagePolicies.push(pkgPolicy);
          }
        });
      } else {
        defaultSpacePackagePolicies.push(pkgPolicy);
      }
    }

    const res: {
      client: SavedObjectsClientContract;
      policies: T[];
    }[] = [];

    if (defaultSpacePackagePolicies.length > 0) {
      res.push({
        client: defaultSpaceSoClient,
        policies: uniqBy(defaultSpacePackagePolicies, 'id'),
      });
    }
    if (spacePackagePolicies.length > 0) {
      res.push({ client: spaceSoClient, policies: uniqBy(spacePackagePolicies, 'id') });
    }

    return res;
  }
}
