/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { toElasticsearchQuery } from '@kbn/es-query';

import { isSpaceAwarenessEnabled as _isSpaceAwarenessEnabled } from '../spaces/helpers';

import { AgentNotFoundError } from '../..';

import { SO_SEARCH_LIMIT } from '../../../common/constants';
import { AGENTS_INDEX } from '../../constants';
import { createAppContextStartContractMock } from '../../mocks';
import type { Agent } from '../../types';
import { appContextService } from '../app_context';
import type { AgentStatus } from '../../../common/types';
import { agentPolicyService } from '../agent_policy';
import { buildPolicyBaseIdsWithFallbackEsFilter } from '../../../common/services/version_specific_policies_utils';

import { auditLoggingService } from '../audit_logging';

import {
  closePointInTime,
  getAgentsByKuery,
  getAgentTags,
  filterAgentIdsByNamespace,
  openPointInTime,
  updateAgent,
  _joinFilters,
  getByIds,
  getAgentsById,
  fetchAllAgentsByKuery,
  getAgentVersionsForAgentPolicyIds,
} from './crud';

jest.mock('../audit_logging');
jest.mock('../agent_policy', () => ({
  agentPolicyService: {
    list: jest.fn().mockResolvedValue({ items: [] }),
    get: jest.fn().mockResolvedValue(null),
    getByIds: jest.fn().mockResolvedValue([]),
    getInactivityTimeouts: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../../common/services/is_agent_upgradeable', () => ({
  isAgentUpgradeAvailable: jest.fn().mockImplementation((agent: Agent) => agent.id.includes('up')),
}));
jest.mock('./versions', () => {
  return {
    getAvailableVersions: jest
      .fn()
      .mockResolvedValue(['8.4.0', '8.5.0', '8.6.0', '8.7.0', '8.8.0']),
    getLatestAvailableAgentVersion: jest.fn().mockResolvedValue('8.8.0'),
  };
});
jest.mock('../spaces/helpers');
jest.mock('timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

const mockedAuditLoggingService = auditLoggingService as jest.Mocked<typeof auditLoggingService>;
const isSpaceAwarenessEnabledMock = _isSpaceAwarenessEnabled as jest.Mock;

describe('Agents CRUD test', () => {
  const soClientMock = savedObjectsClientMock.create();
  let mockContract: ReturnType<typeof createAppContextStartContractMock>;
  let esClientMock: ElasticsearchClient;
  let searchMock: jest.Mock;

  beforeEach(() => {
    searchMock = jest.fn();
    soClientMock.find = jest.fn().mockResolvedValue({ saved_objects: [] });
    esClientMock = {
      search: searchMock,
      openPointInTime: jest.fn().mockResolvedValue({ id: '1' }),
      closePointInTime: jest.fn(),
    } as unknown as ElasticsearchClient;

    mockContract = createAppContextStartContractMock({}, false, {
      withoutSpaceExtensions: soClientMock,
    });
    appContextService.start(mockContract);
  });

  afterEach(() => {
    isSpaceAwarenessEnabledMock.mockReset();
  });

  function getEsResponse(
    ids: string[],
    total: number,
    status: AgentStatus,
    generateSource: (id: string) => Partial<Agent> = () => ({}),
    pitId?: string
  ) {
    return {
      ...(pitId ? { pit_id: pitId } : {}),
      hits: {
        total,
        hits: ids.map((id: string) => ({
          _id: id,
          _source: generateSource(id),
          fields: {
            status: [status],
          },
        })),
      },
    };
  }

  describe('getAgentTags', () => {
    it('should return tags from aggs', async () => {
      searchMock.mockResolvedValueOnce({
        aggregations: {
          tags: { buckets: [{ key: 'tag1' }, { key: 'tag2' }] },
        },
      });

      const result = await getAgentTags(soClientMock, esClientMock, { showInactive: false });

      expect(result).toEqual(['tag1', 'tag2']);
      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          aggs: { tags: { terms: { field: 'tags', size: 10000 } } },
          query: expect.any(Object),
          index: '.fleet-agents',
          size: 0,
          fields: ['status'],
          runtime_mappings: {
            status: expect.anything(),
          },
        })
      );
    });

    it('should return empty list if no agent tags', async () => {
      searchMock.mockResolvedValueOnce({
        aggregations: {
          tags: {},
        },
      });

      const result = await getAgentTags(soClientMock, esClientMock, { showInactive: false });

      expect(result).toEqual([]);
    });

    it('should return empty list if no agent index', async () => {
      searchMock.mockRejectedValueOnce(new errors.ResponseError({ statusCode: 404 } as any));

      const result = await getAgentTags(soClientMock, esClientMock, { showInactive: false });

      expect(result).toEqual([]);
    });

    it('should pass query when called with kuery', async () => {
      searchMock.mockResolvedValueOnce({
        aggregations: {
          tags: { buckets: [{ key: 'tag1' }, { key: 'tag2' }] },
        },
      });

      await getAgentTags(soClientMock, esClientMock, {
        showInactive: true,
        kuery: 'fleet-agents.policy_id: 123',
      });

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          aggs: { tags: { terms: { field: 'tags', size: 10000 } } },
          index: '.fleet-agents',
          size: 0,
          fields: ['status'],
          runtime_mappings: {
            status: expect.anything(),
          },
        })
      );

      expect(searchMock.mock.calls.at(-1)[0].query).toEqual(
        toElasticsearchQuery(
          _joinFilters(['fleet-agents.policy_id: 123', 'NOT status:unenrolled'])!
        )
      );
    });

    it('should apply namespace filter when spaceId is provided and space awareness is enabled', async () => {
      isSpaceAwarenessEnabledMock.mockResolvedValue(true);
      searchMock.mockResolvedValueOnce({
        aggregations: { tags: { buckets: [{ key: 'finance-tag' }] } },
      });

      await getAgentTags(soClientMock, esClientMock, {
        showInactive: false,
        spaceId: 'finance',
      });

      const calledQuery = searchMock.mock.calls.at(-1)[0].query;
      expect(JSON.stringify(calledQuery)).toContain('finance');
    });

    it('should not apply namespace filter when space awareness is disabled', async () => {
      isSpaceAwarenessEnabledMock.mockResolvedValue(false);
      searchMock.mockResolvedValueOnce({
        aggregations: { tags: { buckets: [{ key: 'tag1' }] } },
      });

      await getAgentTags(soClientMock, esClientMock, {
        showInactive: false,
        spaceId: 'finance',
      });

      const calledQuery = searchMock.mock.calls.at(-1)[0].query;
      expect(JSON.stringify(calledQuery)).not.toContain('finance');
    });
  });

  describe('filterAgentIdsByNamespace', () => {
    it('should return all ids unchanged when space awareness is disabled', async () => {
      isSpaceAwarenessEnabledMock.mockResolvedValue(false);
      (soClientMock.getCurrentNamespace as jest.Mock).mockReturnValue('default');

      const result = await filterAgentIdsByNamespace(esClientMock, soClientMock, [
        'agent1',
        'agent2',
      ]);

      expect(result).toEqual(['agent1', 'agent2']);
      expect(searchMock).not.toHaveBeenCalled();
    });

    it('should return empty array when input is empty', async () => {
      isSpaceAwarenessEnabledMock.mockResolvedValue(true);

      const result = await filterAgentIdsByNamespace(esClientMock, soClientMock, []);

      expect(result).toEqual([]);
      expect(searchMock).not.toHaveBeenCalled();
    });

    it('should filter ids by namespace when space awareness is enabled', async () => {
      isSpaceAwarenessEnabledMock.mockResolvedValue(true);
      (soClientMock.getCurrentNamespace as jest.Mock).mockReturnValue('finance');
      searchMock.mockResolvedValueOnce({
        hits: { hits: [{ _id: 'agent1' }] },
      });

      const result = await filterAgentIdsByNamespace(esClientMock, soClientMock, [
        'agent1',
        'agent2',
      ]);

      expect(result).toEqual(['agent1']);
      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          index: AGENTS_INDEX,
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([{ terms: { _id: ['agent1', 'agent2'] } }]),
            }),
          }),
        })
      );
    });
  });

  describe('getAgentsByKuery', () => {
    it('should roll forward PIT id from search responses', async () => {
      searchMock.mockResolvedValueOnce(getEsResponse(['1'], 1, 'online', () => ({}), 'pit-2'));

      const firstRes = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showInactive: false,
        pitId: 'pit-1',
      });

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pit: expect.objectContaining({ id: 'pit-1' }),
        })
      );
      expect(firstRes.pit).toBe('pit-2');

      searchMock.mockResolvedValueOnce(getEsResponse(['2'], 1, 'online', () => ({}), 'pit-3'));

      const secondRes = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showInactive: false,
        pitId: firstRes.pit,
      });

      expect(searchMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pit: expect.objectContaining({ id: 'pit-2' }),
        })
      );
      expect(secondRes.pit).toBe('pit-3');
    });

    it('should return upgradeable on first page', async () => {
      searchMock
        .mockImplementationOnce(() =>
          Promise.resolve(getEsResponse(['1', '2', '3', '4', '5'], 7, 'inactive'))
        )
        .mockImplementationOnce(() =>
          Promise.resolve(getEsResponse(['1', '2', '3', '4', '5', 'up', '7'], 7, 'inactive'))
        );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: true,
        showInactive: false,
        page: 1,
        perPage: 5,
      });

      expect(result).toEqual({
        agents: [
          {
            access_api_key: undefined,
            id: 'up',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
        ],
        page: 1,
        perPage: 5,
        total: 1,
      });
    });

    it('should return upgradeable from all pages', async () => {
      searchMock
        .mockImplementationOnce(() =>
          Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5'], 7, 'inactive'))
        )
        .mockImplementationOnce(() =>
          Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5', 'up2', '7'], 7, 'inactive'))
        );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: true,
        showInactive: false,
        page: 1,
        perPage: 5,
      });

      expect(result).toEqual({
        agents: [
          {
            access_api_key: undefined,
            id: 'up',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
          {
            access_api_key: undefined,
            id: 'up2',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
        ],
        page: 1,
        perPage: 5,
        total: 2,
      });
    });

    it('should return upgradeable on second page', async () => {
      searchMock
        .mockImplementationOnce(() => Promise.resolve(getEsResponse(['up6', '7'], 7, 'inactive')))
        .mockImplementationOnce(() =>
          Promise.resolve(
            getEsResponse(['up1', 'up2', 'up3', 'up4', 'up5', 'up6', '7'], 7, 'inactive')
          )
        );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: true,
        showInactive: false,
        page: 2,
        perPage: 5,
      });

      expect(result).toEqual({
        agents: [
          {
            access_api_key: undefined,
            id: 'up6',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
        ],
        page: 2,
        perPage: 5,
        total: 6,
      });
    });

    it('should return upgradeable from one page when total is more than limit', async () => {
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5'], 10001, 'inactive'))
      );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: true,
        showInactive: false,
        page: 1,
        perPage: 5,
      });

      expect(result).toEqual({
        agents: [
          {
            access_api_key: undefined,
            id: 'up',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
        ],
        page: 1,
        perPage: 5,
        total: 10001,
      });
    });

    it('should return correct status summary when showUpgradeable is selected and total is less than limit', async () => {
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5'], 100, 'updating'))
      );
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5'], 100, 'updating'))
      );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: true,
        showInactive: false,
        getStatusSummary: true,
        page: 1,
        perPage: 5,
      });

      expect(result).toEqual(
        expect.objectContaining({
          page: 1,
          perPage: 5,
          statusSummary: {
            degraded: 0,
            enrolling: 0,
            error: 0,
            inactive: 0,
            offline: 0,
            online: 0,
            orphaned: 0,
            unenrolled: 0,
            unenrolling: 0,
            uninstalled: 0,
            updating: 1,
          },
          total: 1,
        })
      );
    });

    it('should return correct status summary when showUpgradeable is selected and total is more than limit', async () => {
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5'], 10001, 'updating'))
      );
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2', '3', 'up', '5'], 10001, 'updating'))
      );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: true,
        showInactive: false,
        getStatusSummary: true,
        page: 1,
        perPage: 5,
      });
      expect(result).toEqual(
        expect.objectContaining({
          page: 1,
          perPage: 5,
          statusSummary: {
            degraded: 0,
            enrolling: 0,
            error: 0,
            inactive: 0,
            offline: 0,
            orphaned: 0,
            online: 0,
            unenrolled: 0,
            uninstalled: 0,
            unenrolling: 0,
            updating: 1,
          },
          total: 10001,
        })
      );
    });

    it('should return second page', async () => {
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['6', '7'], 7, 'inactive'))
      );
      const result = await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showUpgradeable: false,
        showInactive: false,
        page: 2,
        perPage: 5,
      });

      expect(result).toEqual({
        agents: [
          {
            access_api_key: undefined,
            id: '6',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
          {
            access_api_key: undefined,
            id: '7',
            packages: [],
            policy_revision: undefined,
            status: 'inactive',
          },
        ],
        page: 2,
        perPage: 5,
        total: 7,
      });
    });

    it('should pass secondary sort for default sort', async () => {
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2'], 2, 'inactive'))
      );
      await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showInactive: false,
      });

      expect(searchMock.mock.calls.at(-1)[0].sort).toEqual([
        { enrolled_at: { order: 'desc' } },
        { 'local_metadata.host.hostname.keyword': { order: 'asc' } },
      ]);
    });

    it('should not pass secondary sort for non-default sort', async () => {
      searchMock.mockImplementationOnce(() =>
        Promise.resolve(getEsResponse(['1', '2'], 2, 'inactive'))
      );
      await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showInactive: false,
        sortField: 'policy_id',
      });
      expect(searchMock.mock.calls.at(-1)[0].sort).toEqual([{ policy_id: { order: 'desc' } }]);
    });

    it('should omit the status runtime mapping when includeStatusRuntimeField is false', async () => {
      searchMock.mockResolvedValueOnce(getEsResponse(['1'], 1, 'online'));
      await getAgentsByKuery(esClientMock, soClientMock, {
        showAgentless: true,
        showInactive: false,
        includeStatusRuntimeField: false,
      });
      expect(searchMock.mock.calls[0][0].runtime_mappings).not.toHaveProperty('status');
    });

    describe('status filters', () => {
      beforeEach(() => {
        searchMock.mockImplementationOnce(() => Promise.resolve(getEsResponse([], 0, 'online')));
      });
      it('should add inactive and unenrolled filter', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: true,
          showInactive: false,
          kuery: '',
        });

        expect(searchMock.mock.calls.at(-1)[0].query).toEqual(
          toElasticsearchQuery(_joinFilters(['NOT (status:inactive)', 'NOT status:unenrolled'])!)
        );
      });

      it('should add unenrolled filter', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: true,
          showInactive: true,
          kuery: '',
        });

        expect(searchMock.mock.calls.at(-1)[0].query).toEqual(
          toElasticsearchQuery(_joinFilters(['NOT status:unenrolled'])!)
        );
      });

      it('should not add unenrolled filter', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: true,
          showInactive: true,
          kuery: 'status:unenrolled',
        });

        expect(searchMock.mock.calls.at(-1)[0].query).toEqual(
          toElasticsearchQuery(_joinFilters(['status:unenrolled'])!)
        );
      });

      it('should add inactive filter', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: true,
          showInactive: false,
          kuery: 'status:*',
        });

        expect(searchMock.mock.calls.at(-1)[0].query).toEqual(
          toElasticsearchQuery(_joinFilters(['status:*', 'NOT status:inactive'])!)
        );
      });

      it('should not add inactive filter', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: true,
          showInactive: true,
          kuery: 'status:*',
        });

        expect(searchMock.mock.calls.at(-1)[0].query).toEqual(
          toElasticsearchQuery(_joinFilters(['status:*'])!)
        );
      });
    });

    describe('retry functionality', () => {
      beforeEach(() => {
        searchMock.mockReset();
      });

      it('should retry on transient es errors', async () => {
        const errorWithShardException = new Error('no_shard_available_action_exception: null');

        searchMock
          .mockRejectedValueOnce(errorWithShardException)
          .mockResolvedValueOnce(getEsResponse(['1', '2'], 2, 'online'));

        const result = await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: true,
          showInactive: false,
        });

        expect(searchMock).toHaveBeenCalledTimes(2);

        expect(result).toEqual({
          agents: [
            {
              access_api_key: undefined,
              id: '1',
              packages: [],
              policy_revision: undefined,
              status: 'online',
            },
            {
              access_api_key: undefined,
              id: '2',
              packages: [],
              policy_revision: undefined,
              status: 'online',
            },
          ],
          page: 1,
          perPage: 20,
          total: 2,
        });
      });

      it('should not retry on non-transient errors', async () => {
        const nonTransientError = new Error('Oh no!');

        searchMock.mockRejectedValueOnce(nonTransientError);

        await expect(
          getAgentsByKuery(esClientMock, soClientMock, {
            showAgentless: true,
            showInactive: false,
          })
        ).rejects.toThrow('Oh no!');

        expect(searchMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('kuery replace attributes', () => {
      beforeEach(() => {
        searchMock.mockImplementationOnce(() => Promise.resolve(getEsResponse([], 0, 'online')));
      });

      it('should replace .attributes in kuery', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showInactive: true,
          kuery: 'agent.attributes.agent.id:agent1',
        });

        const query = searchMock.mock.calls.at(-1)[0].query;
        expect(query.bool.filter[0].bool.should[0].match).toEqual({ 'agent.agent.id': 'agent1' });
      });

      it('should not replace identifying_attributes in kuery', async () => {
        await getAgentsByKuery(esClientMock, soClientMock, {
          showInactive: true,
          kuery: 'agent.identifying_attributes.agent.id:agent1',
        });

        const query = searchMock.mock.calls.at(-1)[0].query;
        expect(query.bool.filter[0].bool.should[0].match).toEqual({
          'agent.identifying_attributes.agent.id': 'agent1',
        });
      });
    });

    describe('showAgentless filter', () => {
      const agentlessPolicyIds = ['policy-agentless-1', 'policy-agentless-2'];

      beforeEach(() => {
        searchMock.mockResolvedValue(getEsResponse([], 0, 'online'));
      });

      afterEach(() => {
        (agentPolicyService.list as jest.Mock).mockReset();
        (agentPolicyService.list as jest.Mock).mockResolvedValue({ items: [] });
      });

      it('excludes agents on versioned agentless policies using policy_base_id fallback', async () => {
        (agentPolicyService.list as jest.Mock).mockResolvedValueOnce({
          items: agentlessPolicyIds.map((id) => ({ id })),
        });

        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: false,
          showInactive: false,
        });

        // The exclusion is injected as a must_not using `terms` queries (constant clause count)
        // rather than KQL which would emit N individual `term` clauses per field.
        const query = searchMock.mock.calls.at(-1)[0].query;
        expect(query.bool.must_not).toEqual([
          buildPolicyBaseIdsWithFallbackEsFilter(agentlessPolicyIds),
        ]);
        // Verify the other filters (active + enrolled) are still applied via the filter branch.
        const filterStr = JSON.stringify(query.bool.filter);
        expect(filterStr).toContain('unenrolled');
        // Explicit field check so the intent of the must_not is obvious.
        const queryStr = JSON.stringify(query);
        expect(queryStr).toContain('policy_base_id');
        expect(queryStr).toContain('policy-agentless-1');
        expect(queryStr).toContain('policy-agentless-2');
      });

      it('adds no exclusion clause when there are no agentless policies', async () => {
        // agentPolicyService.list returns { items: [] } by default (see mock above).

        await getAgentsByKuery(esClientMock, soClientMock, {
          showAgentless: false,
          showInactive: false,
        });

        const queryStr = JSON.stringify(searchMock.mock.calls.at(-1)[0].query);
        expect(queryStr).not.toContain('policy_base_id');
        expect(queryStr).not.toContain('policy_id');
      });
    });
  });

  describe('update', () => {
    it('should write to audit log', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      esClient.update.mockResolvedValueOnce({} as any);

      await updateAgent(esClient, 'test-agent-id', { tags: ['new-tag'] });

      expect(mockedAuditLoggingService.writeCustomAuditLog).toHaveBeenCalledWith({
        message: 'User updated agent [id=test-agent-id]',
      });
    });

    it('should use retry_on_conflict', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      esClient.update.mockResolvedValueOnce({} as any);

      await updateAgent(esClient, 'test-agent-id', { tags: ['new-tag'] });

      expect(esClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ retry_on_conflict: 5 })
      );
    });
  });

  describe('openPointInTime', () => {
    it('should call audit logger', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.openPointInTime.mockResolvedValueOnce({ id: 'test-pit' } as any);

      await openPointInTime(esClient);

      expect(mockedAuditLoggingService.writeCustomAuditLog).toHaveBeenCalledWith({
        message: `User opened point in time query [index=${AGENTS_INDEX}] [keepAlive=10m] [pitId=test-pit]`,
      });
    });
  });

  describe('closePointInTime', () => {
    it('should call audit logger', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      esClient.closePointInTime.mockResolvedValueOnce({} as any);

      await closePointInTime(esClient, 'test-pit');

      expect(mockedAuditLoggingService.writeCustomAuditLog).toHaveBeenCalledWith({
        message: `User closing point in time query [pitId=test-pit]`,
      });
    });
  });

  describe('getAgentsById()', () => {
    beforeEach(() => {
      (soClientMock.getCurrentNamespace as jest.Mock).mockReturnValue('foo');
    });

    it('chunks requests so each search stays within max_result_window (10k)', async () => {
      const overflow = 400;
      const firstBatch = Array.from({ length: SO_SEARCH_LIMIT }, (_, i) => `agent-${i}`);
      const secondBatch = Array.from(
        { length: overflow },
        (_, i) => `agent-${SO_SEARCH_LIMIT + i}`
      );
      const agentIds = [...firstBatch, ...secondBatch];

      searchMock
        .mockResolvedValueOnce(
          getEsResponse(firstBatch, firstBatch.length, 'online', (id) => ({
            id,
            namespaces: ['foo'],
          }))
        )
        .mockResolvedValueOnce(
          getEsResponse(secondBatch, secondBatch.length, 'online', (id) => ({
            id,
            namespaces: ['foo'],
          }))
        );

      const result = await getAgentsById(esClientMock, soClientMock, agentIds);

      expect(searchMock).toHaveBeenCalledTimes(2);
      expect(searchMock.mock.calls[0][0].size).toBe(SO_SEARCH_LIMIT);
      expect(searchMock.mock.calls[1][0].size).toBe(overflow);
      expect(result).toHaveLength(agentIds.length);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-0' }));
      expect(result[SO_SEARCH_LIMIT]).toEqual(
        expect.objectContaining({ id: `agent-${SO_SEARCH_LIMIT}` })
      );
    });
  });

  describe(`getByIds()`, () => {
    let searchResponse: ReturnType<typeof getEsResponse>;

    beforeEach(() => {
      searchResponse = getEsResponse(['1', '2'], 2, 'online', (id) => {
        return { id, namespaces: ['foo'] };
      });
      (soClientMock.getCurrentNamespace as jest.Mock).mockReturnValue('foo');
      searchMock.mockImplementation(async () => searchResponse);
    });

    it('should return a list of agents', async () => {
      await expect(getByIds(esClientMock, soClientMock, ['1', '2'])).resolves.toEqual([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '2' }),
      ]);
    });

    it('should omit agents that are not found if `ignoreMissing` is true', async () => {
      searchResponse.hits.hits = [searchResponse.hits.hits[0]];

      await expect(
        getByIds(esClientMock, soClientMock, ['1', '2'], { ignoreMissing: true })
      ).resolves.toEqual([expect.objectContaining({ id: '1' })]);
    });

    it('should error if agent is not found and `ignoreMissing` is false', async () => {
      searchResponse.hits.hits = [searchResponse.hits.hits[0]];

      await expect(getByIds(esClientMock, soClientMock, ['1', '2'])).rejects.toThrow(
        AgentNotFoundError
      );
    });

    it('should error if agent is not part of current space', async () => {
      searchResponse.hits.hits[0]._source.namespaces = ['bar'];
      isSpaceAwarenessEnabledMock.mockResolvedValue(true);

      await expect(getByIds(esClientMock, soClientMock, ['1', '2'])).rejects.toThrow(
        AgentNotFoundError
      );
    });
  });

  describe('fetchAllAgentsByKuery', () => {
    const createEsSearchResultMock = (ids: string[]) => {
      const mock = getEsResponse(ids, ids.length, 'online');
      return {
        ...mock,
        hits: {
          ...mock.hits,
          hits: mock.hits.hits.map((item) => ({ ...item, sort: ['enrolled_at'] })),
        },
      };
    };

    it('should return an iterator', async () => {
      expect(await fetchAllAgentsByKuery(esClientMock, soClientMock, {})).toEqual({
        [Symbol.asyncIterator]: expect.any(Function),
      });
    });

    it('should provide agents on every iteration', async () => {
      const agentIds = [
        ['1', '2', '3'],
        ['4', '5', '6'],
      ];
      searchMock
        .mockResolvedValueOnce(createEsSearchResultMock(agentIds[0]))
        .mockResolvedValueOnce(createEsSearchResultMock(agentIds[1]))
        .mockResolvedValueOnce(createEsSearchResultMock([]));

      let testCounter = 0;
      for await (const agents of await fetchAllAgentsByKuery(esClientMock, soClientMock, {})) {
        expect(agents.map((agent) => agent.id)).toEqual(agentIds[testCounter]);
        testCounter++;
      }

      expect(searchMock).toHaveBeenCalledTimes(3);
    });

    it('should not include _source in the search body by default', async () => {
      searchMock.mockResolvedValueOnce(createEsSearchResultMock([]));
      for await (const _ of await fetchAllAgentsByKuery(esClientMock, soClientMock, {})) {
        // consume to trigger search
      }
      expect(searchMock.mock.calls[0][0]).not.toHaveProperty('_source');
    });

    it('should pass _source through when provided', async () => {
      searchMock.mockResolvedValueOnce(createEsSearchResultMock([]));
      for await (const _ of await fetchAllAgentsByKuery(esClientMock, soClientMock, {
        _source: ['policy_id'],
      })) {
        // consume to trigger search
      }
      expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ _source: ['policy_id'] }));
    });

    it('should pass fetchFields through as fields param when provided', async () => {
      searchMock.mockResolvedValueOnce(createEsSearchResultMock([]));
      for await (const _ of await fetchAllAgentsByKuery(esClientMock, soClientMock, {
        fetchFields: ['status'],
      })) {
        // consume to trigger search
      }
      expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ fields: ['status'] }));
    });

    it('should map agents correctly from filtered _source', async () => {
      const mock = createEsSearchResultMock(['agent-1']);
      mock.hits.hits[0]._source = {
        policy_id: 'p1',
        local_metadata: { host: { hostname: 'h1' } },
      } as any;
      searchMock.mockResolvedValueOnce(mock).mockResolvedValueOnce(createEsSearchResultMock([]));

      const agents: Agent[] = [];
      for await (const page of await fetchAllAgentsByKuery(esClientMock, soClientMock, {
        _source: ['policy_id', 'local_metadata.host.hostname'],
      })) {
        agents.push(...page);
      }

      expect(agents[0].id).toBe('agent-1');
      expect(agents[0].policy_id).toBe('p1');
      expect(agents[0].status).toBe('online');
      expect((agents[0] as any).type).toBeUndefined();
    });
  });
});

describe('getAgentVersionsForAgentPolicyIds', () => {
  it('returns an empty array when no policy ids are provided', async () => {
    const searchMock = jest.fn();
    const esClientMock = { search: searchMock } as unknown as ElasticsearchClient;

    const result = await getAgentVersionsForAgentPolicyIds(
      esClientMock,
      savedObjectsClientMock.create(),
      []
    );

    expect(result).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('queries with a term-or-variant filter and rolls up version-specific variants under their base policy id', async () => {
    const searchMock = jest.fn().mockResolvedValue({
      hits: {
        hits: [
          {
            _source: {
              policy_id: 'policy-a',
              local_metadata: { elastic: { agent: { version: '8.15.0' } } },
            },
          },
          {
            // version-specific variant of policy-a — must roll up under 'policy-a'
            _source: {
              policy_id: 'policy-a#8.16',
              local_metadata: { elastic: { agent: { version: '8.16.0' } } },
            },
          },
          {
            _source: {
              policy_id: 'policy-b',
              local_metadata: { elastic: { agent: { version: '8.15.0' } } },
            },
          },
        ],
      },
    });
    const esClientMock = { search: searchMock } as unknown as ElasticsearchClient;

    const result = await getAgentVersionsForAgentPolicyIds(
      esClientMock,
      savedObjectsClientMock.create(),
      ['policy-a', 'policy-b']
    );

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            filter: [
              expect.objectContaining({
                bool: expect.objectContaining({
                  should: expect.arrayContaining([
                    { terms: { policy_base_id: ['policy-a', 'policy-b'] } },
                  ]),
                }),
              }),
            ],
          },
        },
      })
    );

    expect(result).toEqual(
      expect.arrayContaining([
        { policyId: 'policy-a', versionCounts: { '8.15.0': 1, '8.16.0': 1 } },
        { policyId: 'policy-b', versionCounts: { '8.15.0': 1 } },
      ])
    );
  });
});
