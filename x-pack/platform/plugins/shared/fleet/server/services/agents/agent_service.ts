/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file */

import type {
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';

import type { AggregationsAggregationContainer } from '@elastic/elasticsearch/lib/api/types';

import type { estypes } from '@elastic/elasticsearch';

import type { SortResults } from '@elastic/elasticsearch/lib/api/types';

import type { AgentStatus, ListWithKuery } from '../../types';
import type { Agent, GetAgentStatusResponse } from '../../../common/types';
import { getAuthzFromRequest } from '../security';
import { appContextService } from '../app_context';
import { FleetUnauthorizedError } from '../../errors';

import { getCurrentNamespace } from '../spaces/get_current_namespace';

import { getAgentsByKuery, getAgentById, getByIds } from './crud';
import { getAgentStatusById, getAgentStatusForAgentPolicy } from './status';
import { getLatestAvailableAgentVersion } from './versions';

/**
 * A service for interacting with Agent data. See {@link AgentClient} for more information.
 *
 * @public
 */
export interface AgentService {
  /**
   * Should be used for end-user requests to Kibana. APIs will return errors if user does not have appropriate access.
   */
  asScoped(req: KibanaRequest): AgentClient;

  /**
   * Scoped services to a given space
   */
  asInternalScopedUser(spaceId: string): AgentClient;

  /**
   * Only use for server-side usages (eg. telemetry), should not be used for end users unless an explicit authz check is
   * done.
   */
  asInternalUser: AgentClient;
}

/**
 * A client for interacting with data about an Agent
 *
 * @public
 */
export interface AgentClient {
  /**
   * Get an Agent by id
   */
  getAgent(agentId: string): Promise<Agent>;

  /**
   * Get multiple agents by id
   * @param agentIds
   */
  getByIds(agentIds: string[], options?: { ignoreMissing?: boolean }): Promise<Agent[]>;

  /**
   * Return the status by the Agent's id
   */
  getAgentStatusById(agentId: string): Promise<AgentStatus>;

  /**
   * Return the status by the Agent's Policy id
   */
  getAgentStatusForAgentPolicy(
    agentPolicyId?: string,
    filterKuery?: string
  ): Promise<GetAgentStatusResponse['results']>;

  /**
   * List agents
   */
  listAgents(
    options: ListWithKuery & {
      showAgentless?: boolean;
      showInactive: boolean;
      aggregations?: Record<string, AggregationsAggregationContainer>;
      searchAfter?: SortResults;
      openPit?: boolean;
      pitId?: string;
      pitKeepAlive?: string;
      getStatusSummary?: boolean;
      /**
       * When false, skip the agent-status runtime field and the inactivity-timeout SO scan it
       * requires. Defaults to true. Forced on when `getStatusSummary` is true.
       */
      includeStatusRuntimeField?: boolean;
    }
  ): Promise<{
    agents: Agent[];
    total: number;
    page: number;
    perPage: number;
    pit?: string;
    statusSummary?: Record<AgentStatus, number>;
    aggregations?: Record<string, estypes.AggregationsAggregate>;
  }>;

  /**
   * Return the latest agent available version
   */
  getLatestAgentAvailableVersion(includeCurrentVersion?: boolean): Promise<string>;
  /**
   * Return the latest agent available version, not taking into account IAR versions
   */
  getLatestAgentAvailableBaseVersion(includeCurrentVersion?: boolean): Promise<string>;
  /**
   * Return the latest agent available version formatted for the docker image
   */
  getLatestAgentAvailableDockerImageVersion(includeCurrentVersion?: boolean): Promise<string>;
}

/**
 * @internal
 */
class AgentClientImpl implements AgentClient {
  constructor(
    private readonly internalEsClient: ElasticsearchClient,
    private readonly soClient: SavedObjectsClientContract,
    private readonly preflightCheck?: () => void | Promise<void>,
    private readonly spaceId?: string
  ) {}

  public async listAgents(
    options: ListWithKuery & {
      showAgentless?: boolean;
      showInactive: boolean;
      aggregations?: Record<string, AggregationsAggregationContainer>;
      searchAfter?: SortResults;
      openPit?: boolean;
      pitId?: string;
      pitKeepAlive?: string;
      getStatusSummary?: boolean;
      includeStatusRuntimeField?: boolean;
    }
  ) {
    await this.#runPreflight();
    return getAgentsByKuery(this.internalEsClient, this.soClient, {
      ...options,
      spaceId: this.spaceId,
    });
  }

  public async getAgent(agentId: string) {
    await this.#runPreflight();
    return getAgentById(this.internalEsClient, this.soClient, agentId);
  }

  public async getByIds(
    agentIds: string[],
    options?: Partial<{ ignoreMissing: boolean }>
  ): Promise<Agent[]> {
    await this.#runPreflight();
    return getByIds(this.internalEsClient, this.soClient, agentIds, options);
  }

  public async getAgentStatusById(agentId: string) {
    await this.#runPreflight();
    return getAgentStatusById(this.internalEsClient, this.soClient, agentId);
  }

  public async getAgentStatusForAgentPolicy(agentPolicyId?: string, filterKuery?: string) {
    await this.#runPreflight();
    return getAgentStatusForAgentPolicy(
      this.internalEsClient,
      this.soClient,
      agentPolicyId,
      filterKuery,
      this.spaceId
    );
  }

  public async getLatestAgentAvailableBaseVersion(includeCurrentVersion?: boolean) {
    const fullVersion = await this.getLatestAgentAvailableVersion(includeCurrentVersion);
    return fullVersion.split('+')[0];
  }

  public async getLatestAgentAvailableDockerImageVersion(includeCurrentVersion?: boolean) {
    const fullVersion = await this.getLatestAgentAvailableVersion(includeCurrentVersion);
    return fullVersion.replace('+', '.');
  }

  public async getLatestAgentAvailableVersion(includeCurrentVersion?: boolean) {
    await this.#runPreflight();
    return getLatestAvailableAgentVersion({ includeCurrentVersion });
  }

  #runPreflight = async () => {
    if (this.preflightCheck) {
      return this.preflightCheck();
    }
  };
}

/**
 * @internal
 */
export class AgentServiceImpl implements AgentService {
  constructor(
    private readonly internalEsClient: ElasticsearchClient,
    private readonly soClient: SavedObjectsClientContract
  ) {}

  public asScoped(req: KibanaRequest) {
    const preflightCheck = async () => {
      const authz = await getAuthzFromRequest(req);
      if (!authz.fleet.all && !authz.fleet.readAgents) {
        throw new FleetUnauthorizedError(
          `User does not have adequate permissions to access Fleet agents.`
        );
      }
    };

    const soClient = appContextService.getInternalUserSOClientForSpaceId(
      appContextService.getSavedObjects().getScopedClient(req).getCurrentNamespace()
    );

    return new AgentClientImpl(
      this.internalEsClient,
      soClient,
      preflightCheck,
      getCurrentNamespace(soClient)
    );
  }

  public asInternalScopedUser(spaceId: string): AgentClient {
    if (!spaceId) {
      throw new TypeError(`spaceId argument is required!`);
    }

    const soClient = appContextService.getInternalUserSOClientForSpaceId(spaceId);

    return new AgentClientImpl(
      this.internalEsClient,
      soClient,
      undefined,
      getCurrentNamespace(soClient)
    );
  }

  public get asInternalUser() {
    return new AgentClientImpl(this.internalEsClient, this.soClient);
  }
}
