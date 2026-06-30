/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { uniq } from 'lodash';
import type { ElasticsearchClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';

import type { SearchResponse, SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import type { Agent, AgentPolicy, PackagePolicy } from '@kbn/fleet-plugin/common';
import { AgentNotFoundError } from '@kbn/fleet-plugin/server';
import type {
  HostInfo,
  HostMetadata,
  MaybeImmutable,
  MetadataListResponse,
  PolicyData,
  UnitedAgentMetadataPersistedData,
} from '../../../../common/endpoint/types';
import {
  EndpointHostNotFoundError,
  EndpointHostUnEnrolledError,
  FleetAgentNotFoundError,
  FleetAgentPolicyNotFoundError,
  FleetEndpointPackagePolicyNotFoundError,
} from './errors';
import {
  buildUnitedIndexQuery,
  getESQueryHostMetadataByFleetAgentIds,
  getESQueryHostMetadataByID,
  getESQueryHostMetadataByIDs,
} from '../../routes/metadata/query_builders';
import {
  mapToHostMetadata,
  queryResponseToHostListResult,
  queryResponseToHostResult,
} from '../../routes/metadata/support/query_strategies';
import {
  catchAndWrapError,
  DEFAULT_ENDPOINT_HOST_STATUS,
  fleetAgentStatusToEndpointHostStatus,
  wrapErrorIfNeeded,
} from '../../utils';
import { getAllEndpointPackagePolicies } from '../../routes/metadata/support/endpoint_package_policies';
import type { GetMetadataListRequestQuery } from '../../../../common/api/endpoint';
import { EndpointError } from '../../../../common/endpoint/errors';
import type { EndpointFleetServicesInterface } from '../fleet/endpoint_fleet_services_factory';

type AgentPolicyWithPackagePolicies = Omit<AgentPolicy, 'package_policies'> & {
  package_policies: PackagePolicy[];
};

const isAgentPolicyWithPackagePolicies = (
  agentPolicy: AgentPolicy | AgentPolicyWithPackagePolicies
): agentPolicy is AgentPolicyWithPackagePolicies => {
  return agentPolicy.package_policies ? true : false;
};

export class EndpointMetadataService {
  constructor(
    private readonly esClient: ElasticsearchClient,
    private readonly soClient: SavedObjectsClientContract,
    private readonly fleetServices: EndpointFleetServicesInterface,
    private readonly logger?: Logger
  ) {}

  /**
   * Validates that the data retrieved is valid for the current user space. We do this
   * by just querying fleet to ensure the policy is visible in the current space
   * (the space is determined from the `soClient`)
   *
   * @protected
   */
  protected async ensureDataValidForSpace(data: SearchResponse<HostMetadata>): Promise<void> {
    const agentIds = (data?.hits?.hits || [])
      .map((hit) => hit._source?.agent.id ?? '')
      .filter((id) => !!id);

    if (agentIds.length > 0) {
      this.logger?.debug(
        `Checking to see if the following agent ids are valid for current space:\n${agentIds.join(
          '\n'
        )}`
      );
      await this.fleetServices.ensureInCurrentSpace({ agentIds });
    }
  }

  /**
   * Retrieve a single endpoint host metadata. Note that the return endpoint document, if found,
   * could be associated with a Fleet Agent that is no longer active. If wanting to ensure the
   * endpoint is associated with an active Fleet Agent, then use `getEnrichedHostMetadata()` instead
   *
   * @param endpointId the endpoint id (from `agent.id`)
   *
   * @throws
   */
  async getHostMetadata(endpointId: string, ccsEnabled: boolean = false): Promise<HostMetadata> {
    const query = getESQueryHostMetadataByID(endpointId, ccsEnabled);
    const queryResult = await this.esClient.search<HostMetadata>(query).catch(catchAndWrapError);

    await this.ensureDataValidForSpace(queryResult);

    const endpointMetadata = queryResponseToHostResult(queryResult).result;

    if (endpointMetadata) {
      return endpointMetadata;
    }

    throw new EndpointHostNotFoundError(`Endpoint with id ${endpointId} not found`);
  }

  /**
   * Find a  list of Endpoint Host Metadata document associated with a given list of Fleet Agent Ids
   * @param fleetAgentIds
   */
  async findHostMetadataForFleetAgents(
    fleetAgentIds: string[],
    ccsEnabled: boolean = false
  ): Promise<HostMetadata[]> {
    const query = getESQueryHostMetadataByFleetAgentIds(fleetAgentIds, ccsEnabled);

    query.size = fleetAgentIds.length;

    const searchResult = await this.esClient
      .search<HostMetadata>(query, { ignore: [404] })
      .catch(catchAndWrapError);

    await this.ensureDataValidForSpace(searchResult);

    return queryResponseToHostListResult(searchResult).resultList;
  }

  /**
   * Retrieve a single endpoint host metadata along with fleet information
   *
   * @param endpointId the endpoint id (from `agent.id`)
   *
   * @throws
   */
  async getEnrichedHostMetadata(
    endpointId: string,
    ccsEnabled: boolean = false
  ): Promise<HostInfo> {
    const endpointMetadata = await this.getHostMetadata(endpointId, ccsEnabled);

    let fleetAgentId = endpointMetadata.elastic.agent.id;
    let fleetAgent: Agent | undefined;

    // Get Fleet agent
    try {
      if (!fleetAgentId) {
        fleetAgentId = endpointMetadata.agent.id;
        this.logger?.warn(`Missing elastic agent id, using host id instead ${fleetAgentId}`);
      }

      fleetAgent = await this.getFleetAgent(fleetAgentId);
    } catch (error) {
      if (error instanceof FleetAgentNotFoundError) {
        this.logger?.debug(`agent with id ${fleetAgentId} not found`);
      } else {
        throw error;
      }
    }

    // If the agent is no longer active, then that means that the Agent/Endpoint have been un-enrolled from the host
    if (fleetAgent && !fleetAgent.active) {
      throw new EndpointHostUnEnrolledError(
        `Endpoint with id ${endpointId} (Fleet agent id ${fleetAgentId}) is unenrolled`
      );
    }

    return this.enrichHostMetadata(endpointMetadata, fleetAgent);
  }

  /**
   * Enriches a host metadata document with data from fleet
   *
   * @param endpointMetadata
   * @param _fleetAgent
   * @param _fleetAgentPolicy
   * @param _endpointPackagePolicy
   * @internal
   */
  // eslint-disable-next-line complexity
  private async enrichHostMetadata(
    endpointMetadata: HostMetadata,
    /**
     * If undefined, it will be retrieved from Fleet using the ID in the endpointMetadata.
     * If passing in an `Agent` record that was retrieved from the Endpoint Unified transform index,
     * ensure that its `.status` property is properly set to the calculated value done by
     * fleet.
     */
    _fleetAgent?: MaybeImmutable<Agent>,
    /** If undefined, it will be retrieved from Fleet using data from the endpointMetadata  */
    _fleetAgentPolicy?:
      | MaybeImmutable<AgentPolicy>
      | MaybeImmutable<AgentPolicyWithPackagePolicies>,
    /** If undefined, it will be retrieved from Fleet using the ID in the endpointMetadata */
    _endpointPackagePolicy?: MaybeImmutable<PackagePolicy>
  ): Promise<HostInfo> {
    let fleetAgentId = endpointMetadata.elastic.agent.id;
    // casting below is done only to remove `immutable<>` from the object if they are defined as such
    let fleetAgent = _fleetAgent as Agent | undefined;
    let fleetAgentPolicy = _fleetAgentPolicy as
      | AgentPolicy
      | AgentPolicyWithPackagePolicies
      | undefined;
    let endpointPackagePolicy = _endpointPackagePolicy as PackagePolicy | undefined;

    if (!fleetAgent) {
      try {
        if (!fleetAgentId) {
          fleetAgentId = endpointMetadata.agent.id;
          this.logger?.warn(
            new EndpointError(
              `Missing elastic fleet agent id on Endpoint Metadata doc - using Endpoint agent.id instead: ${fleetAgentId}`
            )
          );
        }

        fleetAgent = await this.getFleetAgent(fleetAgentId);
      } catch (error) {
        if (error instanceof FleetAgentNotFoundError) {
          this.logger?.warn(`Agent with id ${fleetAgentId} not found`);
        } else {
          throw error;
        }
      }
    }

    if (!fleetAgentPolicy && fleetAgent) {
      try {
        fleetAgentPolicy = await this.getFleetAgentPolicy(fleetAgent.policy_id ?? '');
      } catch (error) {
        this.logger?.error(error);
      }
    }

    // The fleetAgentPolicy might have the endpoint policy in the `package_policies`, let's check that first
    if (
      !endpointPackagePolicy &&
      fleetAgentPolicy &&
      isAgentPolicyWithPackagePolicies(fleetAgentPolicy)
    ) {
      endpointPackagePolicy = fleetAgentPolicy.package_policies.find(
        (policy) => policy.package?.name === 'endpoint'
      );
    }

    // if we still don't have an endpoint package policy, try retrieving it from `fleet`
    if (!endpointPackagePolicy) {
      try {
        endpointPackagePolicy = await this.getFleetEndpointPackagePolicy(
          endpointMetadata.Endpoint.policy.applied.id
        );
      } catch (error) {
        this.logger?.error(error);
      }
    }
    return {
      metadata: endpointMetadata,
      host_status: fleetAgent
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          fleetAgentStatusToEndpointHostStatus(fleetAgent.status!)
        : DEFAULT_ENDPOINT_HOST_STATUS,
      policy_info: {
        agent: {
          applied: {
            revision: fleetAgent?.policy_revision ?? 0,
            id: fleetAgent?.policy_id ?? '',
          },
          configured: {
            revision: fleetAgentPolicy?.revision ?? 0,
            id: fleetAgentPolicy?.id ?? '',
          },
        },
        endpoint: {
          revision: endpointPackagePolicy?.revision ?? 0,
          id: endpointPackagePolicy?.id ?? '',
        },
      },
      last_checkin:
        fleetAgent?.last_checkin || new Date(endpointMetadata['@timestamp']).toISOString(),
    };
  }

  /**
   * Retrieve a single Fleet Agent data
   *
   * @param agentId The elastic agent id (`from `elastic.agent.id`)
   */
  async getFleetAgent(agentId: string): Promise<Agent> {
    try {
      return await this.fleetServices.agent.getAgent(agentId);
    } catch (error) {
      if (error instanceof AgentNotFoundError) {
        throw new FleetAgentNotFoundError(`agent with id ${agentId} not found`, error);
      }

      throw new EndpointError(error.message, error);
    }
  }

  /**
   * Retrieve a specific Fleet Agent Policy
   *
   * @param agentPolicyId
   *
   * @throws
   */
  async getFleetAgentPolicy(agentPolicyId: string): Promise<AgentPolicyWithPackagePolicies> {
    const agentPolicy = await this.fleetServices.agentPolicy
      .get(this.soClient, agentPolicyId, true)
      .catch(catchAndWrapError);

    if (agentPolicy) {
      return agentPolicy as AgentPolicyWithPackagePolicies;
    }

    throw new FleetAgentPolicyNotFoundError(
      `Fleet agent policy with id ${agentPolicyId} not found`
    );
  }

  /**
   * Retrieve an endpoint policy from fleet
   * @param endpointPolicyId
   * @throws
   */
  async getFleetEndpointPackagePolicy(endpointPolicyId: string): Promise<PolicyData> {
    const endpointPackagePolicy = await this.fleetServices.packagePolicy
      .get(this.soClient, endpointPolicyId)
      .catch(catchAndWrapError);

    if (!endpointPackagePolicy) {
      throw new FleetEndpointPackagePolicyNotFoundError(
        `Fleet endpoint package policy with id ${endpointPolicyId} not found`
      );
    }

    return endpointPackagePolicy as PolicyData;
  }

  /**
   * Retrieve list of host metadata. Only supports new united index.
   *
   * @param queryOptions
   *
   * @throws
   */
  async getHostMetadataList(
    queryOptions: GetMetadataListRequestQuery,
    ccsEnabled: boolean = false
  ): Promise<Pick<MetadataListResponse, 'data' | 'total'>> {
    const endpointPolicies = await this.getAllEndpointPackagePolicies();
    const endpointPolicyIds = uniq(endpointPolicies.flatMap((policy) => policy.policy_ids));
    const unitedIndexQuery = await buildUnitedIndexQuery(
      this.soClient,
      queryOptions,
      endpointPolicyIds,
      ccsEnabled
    );

    let unitedMetadataQueryResponse: SearchResponse<UnitedAgentMetadataPersistedData>;

    try {
      unitedMetadataQueryResponse = await this.esClient.search<UnitedAgentMetadataPersistedData>(
        unitedIndexQuery
      );
      // FYI: we don't need to run the ES search response through `this.ensureDataValidForSpace()` because
      // the query (`unitedIndexQuery`) above already included a filter with all of the valid policy ids
      // for the current space - thus data is already coped to the space
    } catch (error) {
      const errorType = error?.meta?.body?.error?.type ?? '';
      if (errorType === 'index_not_found_exception') {
        return {
          data: [],
          total: 0,
        };
      }

      const err = wrapErrorIfNeeded(error);
      this.logger?.error(err);
      throw err;
    }

    const { hits: docs, total: docsCount } = unitedMetadataQueryResponse?.hits || {};
    const agentPolicyIds: string[] = docs.map((doc) => doc._source?.united?.agent?.policy_id ?? '');

    const agentPolicies =
      (await this.fleetServices.agentPolicy
        .getByIds(this.soClient, agentPolicyIds)
        .catch(catchAndWrapError)) ?? [];

    const agentPoliciesMap = agentPolicies.reduce<Record<string, AgentPolicy>>(
      (acc, agentPolicy) => {
        acc[agentPolicy.id] = {
          ...agentPolicy,
        };
        return acc;
      },
      {}
    );

    const endpointPoliciesMap = endpointPolicies.reduce<Record<string, PackagePolicy>>(
      (acc, packagePolicy) => {
        for (const policyId of packagePolicy.policy_ids) {
          acc[policyId] = packagePolicy;
        }
        return acc;
      },
      {}
    );

    const hosts: HostInfo[] = [];

    for (const doc of docs) {
      const { endpoint, agent: _agent } = doc?._source?.united ?? {};

      if (endpoint && _agent) {
        const metadata = mapToHostMetadata(endpoint);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const agentPolicy = agentPoliciesMap[_agent.policy_id!];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const endpointPolicy = endpointPoliciesMap[_agent.policy_id!];
        const runtimeFields: Partial<typeof _agent> = {
          status: doc?.fields?.status?.[0],
          last_checkin: doc?.fields?.last_checkin?.[0],
        };
        const agent: typeof _agent = {
          ..._agent,
          ...runtimeFields,
        };

        hosts.push(await this.enrichHostMetadata(metadata, agent, agentPolicy, endpointPolicy));
      }
    }

    return {
      data: hosts,
      total: (docsCount as unknown as SearchTotalHits).value,
    };
  }

  async getAllEndpointPackagePolicies() {
    return getAllEndpointPackagePolicies(this.fleetServices.packagePolicy, this.soClient);
  }

  async getMetadataForEndpoints(
    endpointIDs: string[],
    ccsEnabled: boolean = false
  ): Promise<HostMetadata[]> {
    const query = getESQueryHostMetadataByIDs(endpointIDs, ccsEnabled);
    const searchResult = await this.esClient.search<HostMetadata>(query).catch(catchAndWrapError);

    await this.ensureDataValidForSpace(searchResult);

    return queryResponseToHostListResult(searchResult).resultList;
  }
}
