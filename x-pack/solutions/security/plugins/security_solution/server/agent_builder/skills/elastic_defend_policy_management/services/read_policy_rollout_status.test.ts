/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient, KibanaRequest, StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { FleetAgentPolicyGenerator } from '../../../../../common/endpoint/data_generators/fleet_agent_policy_generator';
import { FleetPackagePolicyGenerator } from '../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import {
  METADATA_UNITED_INDEX,
  policyIndexPattern,
} from '../../../../../common/endpoint/constants';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { INITIAL_POLICY_ID } from '../../../../endpoint/routes/policy';
import { ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ } from '../../../../../common/endpoint/service/authz';
import { createPolicyAccessContext } from './access_context';
import {
  POLICY_ROLLOUT_AGENT_ID_AGG_NAME,
  POLICY_ROLLOUT_TUPLE_AGG_NAME,
} from './policy_rollout_status/united_rollout_status_aggregation';
import type {
  CurrentRevisionResponses,
  CurrentRevisionResponsesSource,
  RevisionCoverage,
  RevisionCoverageSource,
} from './read_policy_rollout_status';
import { readPolicyRolloutStatus } from './read_policy_rollout_status';

type RequestIsRequired = undefined extends Parameters<typeof readPolicyRolloutStatus>[3]
  ? false
  : true;
type RequestIsKibanaRequest = Parameters<typeof readPolicyRolloutStatus>[3] extends KibanaRequest
  ? true
  : never;

const _requestIsRequired: RequestIsRequired = true;
const _requestIsKibanaRequest: RequestIsKibanaRequest = true;

void _requestIsRequired;
void _requestIsKibanaRequest;

const SPACE_ID = 'space-marketing';
const POLICY_ID = 'policy-a';
const POLICY_NAME = 'Policy A';
const POLICY_REVISION = 3;
const AGENT_POLICY_A = 'agent-policy-a';
const AGENT_POLICY_B = 'agent-policy-b';
const OUT_OF_DATE_POPULATION =
  'readable_united_endpoint_hosts_canonical_assignment_matches_target_agent_policy_ids' as const;
const FAILURE_POPULATION =
  'latest_policy_responses_for_assignment_matched_agents_at_current_package_revision' as const;
const packagePolicyGenerator = new FleetPackagePolicyGenerator();
const agentPolicyGenerator = new FleetAgentPolicyGenerator();

const expectedPolicy = {
  id: POLICY_ID,
  name: POLICY_NAME,
  revision: POLICY_REVISION,
} as const;

const coverageZero = (source: RevisionCoverageSource): RevisionCoverage => ({
  outOfDateHosts: 0,
  classifiedHosts: 0,
  undeterminedHosts: 0,
  unclassifiedOverflowHosts: 0,
  truncated: false,
  source,
  population: OUT_OF_DATE_POPULATION,
});

const responseZero = (
  source: CurrentRevisionResponsesSource,
  extras: Partial<Pick<CurrentRevisionResponses, 'upstreamUnclassifiedHosts' | 'truncated'>> = {}
): CurrentRevisionResponses => ({
  needsAttentionHosts: 0,
  classifiedHosts: 0,
  undeterminedHosts: 0,
  upstreamUnclassifiedHosts: 0,
  responseCoverageIncomplete: false,
  truncated: false,
  source,
  population: FAILURE_POPULATION,
  ...extras,
});

const createEndpointPolicy = (
  overrides: Parameters<FleetPackagePolicyGenerator['generateEndpointPackagePolicy']>[0] = {}
) =>
  packagePolicyGenerator.generateEndpointPackagePolicy({
    version: 'WzEsMV0=',
    id: POLICY_ID,
    name: POLICY_NAME,
    revision: POLICY_REVISION,
    policy_ids: [AGENT_POLICY_A],
    ...overrides,
  });

const inDateTuple = (agentPolicyId: string, docCount: number, reportedPackageId = POLICY_ID) => ({
  key: [agentPolicyId, reportedPackageId, 5, POLICY_REVISION, 5],
  doc_count: docCount,
});

const successfulClusterDetail = (totalShards: number) => ({
  status: 'successful',
  _shards: { total: totalShards, successful: totalShards, skipped: 0, failed: 0 },
});

const unitedSearchResult = ({
  tuples = [inDateTuple(AGENT_POLICY_A, 1)],
  agents = [{ key: 'agent-1', doc_count: 1 }],
  tupleOverflow = 0,
  agentOverflow = 0,
  clusters,
}: {
  tuples?: Array<{ key: unknown[]; doc_count: number }>;
  agents?: Array<{ key: string; doc_count?: number }>;
  tupleOverflow?: number;
  agentOverflow?: number;
  clusters?: unknown;
} = {}) => ({
  aggregations: {
    [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
      buckets: tuples,
      sum_other_doc_count: tupleOverflow,
    },
    [POLICY_ROLLOUT_AGENT_ID_AGG_NAME]: {
      buckets: agents,
      sum_other_doc_count: agentOverflow,
    },
  },
  ...(clusters !== undefined ? { _clusters: clusters } : {}),
});

const appliedSource = (
  overrides: {
    id?: string;
    version?: number;
    endpoint_policy_version?: number | string | null;
    actions?: unknown;
  } = {}
) => ({
  Endpoint: {
    policy: {
      applied: {
        id: POLICY_ID,
        version: 5,
        endpoint_policy_version: POLICY_REVISION,
        actions: [{ name: 'configure', message: 'failed', status: 'failure' }],
        ...overrides,
      },
    },
  },
});

const responseSearchResult = ({
  hits,
  clusters,
}: {
  hits: Array<{ agentId: string; hit?: { _id?: unknown; _source?: unknown } }>;
  overflow?: number;
  clusters?: unknown;
}) => ({
  aggregations: {
    latest_actions: {
      buckets: hits.map(({ agentId, hit }) => ({
        key: agentId,
        doc_count: 1,
        latest_event: {
          hits: {
            hits: hit ? [hit] : [],
          },
        },
      })),
      sum_other_doc_count: 0,
    },
  },
  ...(clusters !== undefined ? { _clusters: clusters } : {}),
});

const currentFailureHit = (agentId: string, source: Record<string, unknown> = appliedSource()) => ({
  _id: `hit-${agentId}`,
  _source: {
    agent: { id: agentId },
    ...source,
  },
});

const asSearchRequest = (request: unknown): estypes.SearchRequest => {
  if (request == null || typeof request !== 'object') {
    throw new Error('expected Elasticsearch search request');
  }

  return request as estypes.SearchRequest;
};

const indexName = (request: unknown): string => {
  const { index } = asSearchRequest(request);
  return Array.isArray(index) ? index.join(',') : String(index ?? '');
};

const isUnitedSearch = (request: unknown): boolean =>
  indexName(request).includes('metadata_united');

const searchCall = (
  esClient: jest.Mocked<ElasticsearchClient>,
  callIndex: number
): estypes.SearchRequest => asSearchRequest(esClient.search.mock.calls[callIndex]?.[0]);

const createEndpointUsageAccess = async () => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const request = httpServerMock.createKibanaRequest();
  const getHostMetadataList = jest.fn();

  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock({
      canReadPolicyManagement: true,
      canReadEndpointList: true,
      canWritePolicyManagement: false,
    })
  );
  jest.mocked(endpointAppContextService.getEndpointMetadataService).mockReturnValue({
    getHostMetadataList,
  } as unknown as ReturnType<typeof endpointAppContextService.getEndpointMetadataService>);

  const getStartServices = jest.fn(async () => [
    { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
  ]) as unknown as StartServicesAccessor;
  const access = await createPolicyAccessContext(
    endpointAppContextService,
    { request, spaceId: SPACE_ID },
    ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
    getStartServices
  );
  const soClient = access.fleet.getSoClient();
  const listByName = jest.spyOn(access.fleet.packagePolicy, 'list');
  const ensureInCurrentSpace = jest.spyOn(access.fleet, 'ensureInCurrentSpace');
  const getByIds = jest.spyOn(access.fleet.agentPolicy, 'getByIds');
  const esClient =
    (await endpointAppContextService.getReadEsClient()) as jest.Mocked<ElasticsearchClient>;

  endpointAppContextService.getReadEsClient.mockClear();
  endpointAppContextService.getInternalEsClient.mockClear();
  ensureInCurrentSpace.mockResolvedValue(undefined);
  getByIds.mockResolvedValue([agentPolicyGenerator.generate({ id: AGENT_POLICY_A, revision: 5 })]);

  return {
    access,
    request,
    endpointAppContextService,
    soClient,
    listByName,
    ensureInCurrentSpace,
    getByIds,
    getHostMetadataList,
    esClient,
  };
};

const mockSearches = (
  esClient: jest.Mocked<ElasticsearchClient>,
  {
    united,
    response,
  }: {
    united?: object | (() => Promise<never>);
    response?: object;
  }
) => {
  esClient.search.mockImplementation(async (request) => {
    if (isUnitedSearch(request)) {
      if (typeof united === 'function') {
        return united();
      }
      return united as unknown as estypes.SearchResponse;
    }

    return (response ?? { aggregations: undefined }) as unknown as estypes.SearchResponse;
  });
};

const expectNoForbiddenApis = ({
  getHostMetadataList,
  listByName,
  endpointAppContextService,
}: {
  getHostMetadataList: jest.Mock;
  listByName: jest.SpyInstance;
  endpointAppContextService: ReturnType<typeof createMockEndpointAppContextService>;
}): void => {
  expect(getHostMetadataList).not.toHaveBeenCalled();
  expect(listByName).not.toHaveBeenCalled();
  expect(endpointAppContextService.getInternalEsClient).not.toHaveBeenCalled();
};

describe('readPolicyRolloutStatus', () => {
  it('returns the empty_assignments DTO and issues no ES or agent-policy reads', async () => {
    const harness = await createEndpointUsageAccess();

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy({ policy_ids: [] }) },
      harness.request
    );

    expect(result).toEqual({
      policy: expectedPolicy,
      spaceId: SPACE_ID,
      revisionCoverage: coverageZero('no_agent_policy_assignments'),
      currentRevisionResponses: responseZero('no_agent_policy_assignments'),
    });
    expect(harness.getByIds).not.toHaveBeenCalled();
    expect(harness.esClient.search).not.toHaveBeenCalled();
    expect(harness.endpointAppContextService.getReadEsClient).not.toHaveBeenCalled();
    expectNoForbiddenApis(harness);
  });

  it('returns the united_missing DTO and does not search policy responses', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: async () => {
        throw Object.assign(new Error('index missing'), {
          meta: { body: { error: { type: 'index_not_found_exception' } } },
        });
      },
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    expect(result).toEqual({
      policy: expectedPolicy,
      spaceId: SPACE_ID,
      revisionCoverage: coverageZero('united_index_missing'),
      currentRevisionResponses: responseZero('united_index_missing'),
    });
    expect(harness.esClient.search).toHaveBeenCalledTimes(1);
    expect(isUnitedSearch(searchCall(harness.esClient, 0))).toBe(true);
    expect(harness.endpointAppContextService.getReadEsClient).toHaveBeenCalledWith(harness.request);
    expectNoForbiddenApis(harness);
  });

  it('rethrows non-index_not_found united Elasticsearch faults', async () => {
    const harness = await createEndpointUsageAccess();
    const searchFault = new Error('search_phase_execution_exception');
    mockSearches(harness.esClient, {
      united: async () => {
        throw searchFault;
      },
    });

    await expect(
      readPolicyRolloutStatus(
        harness.access,
        harness.endpointAppContextService,
        { packagePolicy: createEndpointPolicy() },
        harness.request
      )
    ).rejects.toBe(searchFault);
    expect(harness.esClient.search).toHaveBeenCalledTimes(1);
  });

  it('does not treat a message-only index_not_found Error as united_missing', async () => {
    const harness = await createEndpointUsageAccess();
    const messageOnly = new Error('index_not_found_exception');
    mockSearches(harness.esClient, {
      united: async () => {
        throw messageOnly;
      },
    });

    await expect(
      readPolicyRolloutStatus(
        harness.access,
        harness.endpointAppContextService,
        { packagePolicy: createEndpointPolicy() },
        harness.request
      )
    ).rejects.toBe(messageOnly);
  });

  it('returns united_empty_agent_set with upstream overflow and does not search policy responses', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({
        tuples: [
          { key: [AGENT_POLICY_A, POLICY_ID, 5, POLICY_REVISION, 5], doc_count: 800 },
          { key: [AGENT_POLICY_A, 'stale-pkg', 5, POLICY_REVISION, 5], doc_count: 5 },
        ],
        agents: [],
        tupleOverflow: 20,
        agentOverflow: 20,
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    expect(result).toEqual({
      policy: expectedPolicy,
      spaceId: SPACE_ID,
      revisionCoverage: {
        outOfDateHosts: 5,
        classifiedHosts: 805,
        undeterminedHosts: 0,
        unclassifiedOverflowHosts: 20,
        truncated: true,
        source: 'united_metadata_tuple_aggregation',
        population: OUT_OF_DATE_POPULATION,
      },
      currentRevisionResponses: responseZero('united_agent_id_set_empty', {
        upstreamUnclassifiedHosts: 20,
        truncated: true,
      }),
    });
    expect(harness.esClient.search).toHaveBeenCalledTimes(1);
    expectNoForbiddenApis(harness);
  });

  it('returns response_404 extras after an issued empty policy-response search', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({
        agents: [{ key: 'agent-1' }],
        agentOverflow: 20,
      }),
      response: { aggregations: undefined },
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    expect(result.revisionCoverage.source).toBe('united_metadata_tuple_aggregation');
    expect(result.currentRevisionResponses).toEqual({
      needsAttentionHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 0,
      upstreamUnclassifiedHosts: 20,
      responseCoverageIncomplete: false,
      truncated: true,
      source: 'policy_response_latest_per_agent',
      population: FAILURE_POPULATION,
    });
    expect(harness.esClient.search).toHaveBeenCalledTimes(2);
    expect(isUnitedSearch(searchCall(harness.esClient, 1))).toBe(false);
  });

  it('counts only out-of-date tuples when the same package spans distinct agent policies', async () => {
    const harness = await createEndpointUsageAccess();
    harness.getByIds.mockResolvedValue([
      agentPolicyGenerator.generate({ id: AGENT_POLICY_A, revision: 5 }),
      agentPolicyGenerator.generate({ id: AGENT_POLICY_B, revision: 9 }),
    ]);
    mockSearches(harness.esClient, {
      united: unitedSearchResult({
        tuples: [inDateTuple(AGENT_POLICY_A, 10), inDateTuple(AGENT_POLICY_B, 4)],
        agents: [{ key: 'agent-1' }],
      }),
      response: responseSearchResult({
        hits: [{ agentId: 'agent-1', hit: currentFailureHit('agent-1', appliedSource()) }],
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy({ policy_ids: [AGENT_POLICY_A, AGENT_POLICY_B] }) },
      harness.request
    );

    expect(result.revisionCoverage.outOfDateHosts).toBe(4);
    expect(result.revisionCoverage.classifiedHosts).toBe(14);
    expect(result.revisionCoverage.unclassifiedOverflowHosts).toBe(0);
    expect(harness.getByIds).toHaveBeenCalledWith(
      harness.soClient,
      [AGENT_POLICY_A, AGENT_POLICY_B],
      {
        ignoreMissing: true,
      }
    );
  });

  it('counts zero current failures when latest is INITIAL after an older current failure', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({ agents: [{ key: 'agent-1' }] }),
      response: responseSearchResult({
        hits: [
          {
            agentId: 'agent-1',
            hit: currentFailureHit(
              'agent-1',
              appliedSource({
                id: INITIAL_POLICY_ID,
                actions: [{ name: 'configure', message: 'failed', status: 'failure' }],
              })
            ),
          },
        ],
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );
    const responseRequest = searchCall(harness.esClient, 1);

    expect(result.currentRevisionResponses.needsAttentionHosts).toBe(0);
    expect(result.currentRevisionResponses.classifiedHosts).toBe(0);
    expect(result.currentRevisionResponses.undeterminedHosts).toBe(0);
    expect(JSON.stringify(responseRequest.query)).not.toContain(INITIAL_POLICY_ID);
    expect(responseRequest.query?.bool?.must_not).toBeUndefined();
    expect(JSON.stringify(responseRequest.query)).not.toContain('Endpoint.policy.applied.id');
  });

  it('skips malformed policy-response hits instead of counting them as failures', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({
        agents: [{ key: 'agent-1' }, { key: 'agent-2' }, { key: 'agent-3' }, { key: 'agent-4' }],
      }),
      response: responseSearchResult({
        hits: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2', hit: { _id: 12, _source: appliedSource() } },
          {
            agentId: 'agent-3',
            hit: currentFailureHit('agent-3', appliedSource({ actions: 'not-an-array' })),
          },
          {
            agentId: 'agent-4',
            hit: currentFailureHit('agent-4', {
              Endpoint: { policy: {} },
            }),
          },
        ],
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    expect(result.currentRevisionResponses.needsAttentionHosts).toBe(0);
    expect(result.currentRevisionResponses.classifiedHosts).toBe(0);
    expect(result.currentRevisionResponses.undeterminedHosts).toBe(2);
    expect(result.currentRevisionResponses.source).toBe('policy_response_latest_per_agent');
  });

  it('classifies a current-revision empty actions array as no_attention', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({ agents: [{ key: 'agent-1' }] }),
      response: responseSearchResult({
        hits: [
          {
            agentId: 'agent-1',
            hit: currentFailureHit('agent-1', appliedSource({ actions: [] })),
          },
        ],
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    expect(result.currentRevisionResponses.needsAttentionHosts).toBe(0);
    expect(result.currentRevisionResponses.classifiedHosts).toBe(1);
    expect(result.currentRevisionResponses.undeterminedHosts).toBe(0);
    expect(result.currentRevisionResponses.responseCoverageIncomplete).toBe(false);
  });

  it('propagates request, CCS, and CPS pairing to both Defend reads', async () => {
    const harness = await createEndpointUsageAccess();
    harness.endpointAppContextService.isCcsEnabled.mockResolvedValue(true);
    harness.endpointAppContextService.isCpsActive.mockResolvedValue(false);
    mockSearches(harness.esClient, {
      united: unitedSearchResult({ agents: [{ key: 'agent-1' }] }),
      response: responseSearchResult({
        hits: [{ agentId: 'agent-1', hit: currentFailureHit('agent-1') }],
      }),
    });

    await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    const unitedRequest = searchCall(harness.esClient, 0);
    const responseRequest = searchCall(harness.esClient, 1);

    expect(harness.endpointAppContextService.getReadEsClient).toHaveBeenCalledTimes(1);
    expect(harness.endpointAppContextService.getReadEsClient).toHaveBeenCalledWith(harness.request);
    expect(
      harness.endpointAppContextService.getReadEsClient.mock.calls.every(([value]) => value)
    ).toBe(true);
    expect(harness.endpointAppContextService.isCpsRead).toHaveBeenCalledWith(harness.request);
    expect(unitedRequest.index).toBe(`${METADATA_UNITED_INDEX},*:${METADATA_UNITED_INDEX}`);
    expect(indexName(responseRequest)).toBe(`${policyIndexPattern},*:${policyIndexPattern}`);
    expect(responseRequest.allow_no_indices).toBe(true);
    expect(responseRequest.ignore_unavailable).toBe(true);
    expect(JSON.stringify(responseRequest.aggs)).toContain('event.created');
    expect(JSON.stringify(responseRequest)).toContain(
      'Endpoint.policy.applied.endpoint_policy_version'
    );
  });

  it('keeps CCS off both indexes when CPS can fan out the request', async () => {
    const harness = await createEndpointUsageAccess();
    harness.endpointAppContextService.isCcsEnabled.mockResolvedValue(true);
    harness.endpointAppContextService.isCpsActive.mockResolvedValue(true);
    mockSearches(harness.esClient, {
      united: unitedSearchResult({ agents: [{ key: 'agent-1' }] }),
      response: { aggregations: undefined },
    });

    await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );

    const unitedRequest = searchCall(harness.esClient, 0);
    const responseRequest = searchCall(harness.esClient, 1);

    expect(harness.endpointAppContextService.isCpsRead).toHaveBeenCalledWith(harness.request);
    expect(unitedRequest.index).toBe(METADATA_UNITED_INDEX);
    expect(indexName(responseRequest)).toBe(policyIndexPattern);
    expect(JSON.stringify(unitedRequest.query)).not.toContain('united.agent.namespaces');
    expect(JSON.stringify(unitedRequest.query)).not.toContain(SPACE_ID);
  });

  it.each([
    {
      name: 'omitted remote cluster',
      unitedClusters: {
        details: {
          '(local)': successfulClusterDetail(1),
          'remote-a': successfulClusterDetail(2),
        },
      },
      policyClusters: {
        successful: 1,
        total: 1,
        details: {
          '(local)': successfulClusterDetail(1),
        },
      },
      incomplete: true,
    },
    {
      name: 'zero-shard remote cluster',
      unitedClusters: {
        details: {
          '(local)': successfulClusterDetail(1),
          'remote-a': successfulClusterDetail(2),
        },
      },
      policyClusters: {
        successful: 2,
        total: 2,
        details: {
          '(local)': successfulClusterDetail(1),
          'remote-a': successfulClusterDetail(0),
        },
      },
      incomplete: true,
    },
    {
      name: 'matching complete coverage with empty hits',
      unitedClusters: {
        successful: 2,
        total: 2,
        details: {
          '(local)': successfulClusterDetail(1),
          'remote-a': successfulClusterDetail(2),
        },
      },
      policyClusters: {
        successful: 2,
        total: 2,
        details: {
          '(local)': successfulClusterDetail(1),
          'remote-a': successfulClusterDetail(2),
        },
      },
      incomplete: false,
    },
  ])(
    'reports ordinary-CCS coverage $name without changing empty-hit counts',
    async ({ unitedClusters, policyClusters, incomplete }) => {
      const harness = await createEndpointUsageAccess();
      harness.endpointAppContextService.isCcsEnabled.mockResolvedValue(true);
      harness.endpointAppContextService.isCpsActive.mockResolvedValue(false);
      mockSearches(harness.esClient, {
        united: unitedSearchResult({
          agents: [{ key: 'agent-1' }],
          clusters: unitedClusters,
        }),
        response: responseSearchResult({
          hits: [{ agentId: 'agent-1' }],
          clusters: policyClusters,
        }),
      });

      const result = await readPolicyRolloutStatus(
        harness.access,
        harness.endpointAppContextService,
        { packagePolicy: createEndpointPolicy() },
        harness.request
      );
      const responses = result.currentRevisionResponses;

      expect(responses.responseCoverageIncomplete).toBe(incomplete);
      expect(responses.needsAttentionHosts).toBe(0);
      expect(responses.classifiedHosts).toBe(0);
      expect(responses.undeterminedHosts).toBe(0);
      expect(responses.source).toBe('policy_response_latest_per_agent');
      expect(responses.population).toBe(FAILURE_POPULATION);
    }
  );

  it('propagates a thrown policy-response search without relabeling it united_missing', async () => {
    const harness = await createEndpointUsageAccess();
    const responseFault = Object.assign(new Error('index missing'), {
      meta: { body: { error: { type: 'index_not_found_exception' } } },
    });
    harness.esClient.search.mockImplementation(async (request) => {
      if (isUnitedSearch(request)) {
        return unitedSearchResult({
          agents: [{ key: 'agent-1' }],
        }) as unknown as estypes.SearchResponse;
      }
      throw responseFault;
    });

    await expect(
      readPolicyRolloutStatus(
        harness.access,
        harness.endpointAppContextService,
        { packagePolicy: createEndpointPolicy() },
        harness.request
      )
    ).rejects.toBe(responseFault);
  });

  it('counts failure and warning actions as needs attention and excludes unsupported', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({
        agents: [{ key: 'failure' }, { key: 'warning' }, { key: 'unsupported' }],
      }),
      response: responseSearchResult({
        hits: [
          {
            agentId: 'failure',
            hit: currentFailureHit(
              'failure',
              appliedSource({
                actions: [{ name: 'configure', message: 'failed', status: 'failure' }],
              })
            ),
          },
          {
            agentId: 'warning',
            hit: currentFailureHit(
              'warning',
              appliedSource({
                actions: [{ name: 'configure', message: 'warn', status: 'warning' }],
              })
            ),
          },
          {
            agentId: 'unsupported',
            hit: currentFailureHit(
              'unsupported',
              appliedSource({
                actions: [{ name: 'configure', message: 'skip', status: 'unsupported' }],
              })
            ),
          },
        ],
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );
    const responses = result.currentRevisionResponses;

    expect(responses.needsAttentionHosts).toBe(2);
    expect(responses.classifiedHosts).toBe(3);
    expect(responses.undeterminedHosts).toBe(0);
  });

  it('does not count a valid non-current response as an undetermined current response', async () => {
    const harness = await createEndpointUsageAccess();
    mockSearches(harness.esClient, {
      united: unitedSearchResult({
        agents: [{ key: 'other-policy' }, { key: 'other-rev' }],
      }),
      response: responseSearchResult({
        hits: [
          {
            agentId: 'other-policy',
            hit: currentFailureHit('other-policy', appliedSource({ id: 'policy-b' })),
          },
          {
            agentId: 'other-rev',
            hit: currentFailureHit(
              'other-rev',
              appliedSource({ endpoint_policy_version: POLICY_REVISION - 1 })
            ),
          },
        ],
      }),
    });

    const result = await readPolicyRolloutStatus(
      harness.access,
      harness.endpointAppContextService,
      { packagePolicy: createEndpointPolicy() },
      harness.request
    );
    const responses = result.currentRevisionResponses;

    expect(responses.needsAttentionHosts).toBe(0);
    expect(responses.classifiedHosts).toBe(0);
    expect(responses.undeterminedHosts).toBe(0);
  });
});
