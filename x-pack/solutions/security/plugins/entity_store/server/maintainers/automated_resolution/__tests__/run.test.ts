/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { ResolutionClient } from '../../../domain/resolution';
import { runEmailRuleResolution, selectTarget } from '../run';
import type { EntityHit, PerRuleState } from '../types';
import type { RunDeps } from '../run';

const NAMESPACE = 'default';

const createInitialState = (overrides: Partial<PerRuleState> = {}): PerRuleState => ({
  lastProcessedTimestamp: null,
  lastRun: null,
  ...overrides,
});

const createDeps = (
  state: PerRuleState,
  esClient: ElasticsearchClient,
  resolutionClient: ResolutionClient,
  overrides: Partial<RunDeps> = {}
): RunDeps => ({
  state,
  namespace: NAMESPACE,
  esClient,
  logger: loggerMock.create(),
  resolutionClient,
  abortController: new AbortController(),
  ...overrides,
});

const createCollectNewEmailsResponse = (
  emails: string[],
  maxTimestamp: string,
  afterKey?: Record<string, string>
) => ({
  aggregations: {
    emails: {
      buckets: emails.map((e) => ({ key: { email: e }, doc_count: 1 })),
      ...(afterKey ? { after_key: afterKey } : {}),
    },
    max_timestamp: { value_as_string: maxTimestamp },
  },
});

const createFindMatchingGroupsResponse = (
  groups: Array<{
    email: string;
    unresolved: Array<{ id: string; namespace: string }>;
    existingTargets: string[];
    totalUnresolved?: number;
  }>
) => ({
  aggregations: {
    email_groups: {
      buckets: groups.map((g) => ({
        key: g.email,
        doc_count: g.unresolved.length + g.existingTargets.length,
        unresolved: {
          doc_count: g.totalUnresolved ?? g.unresolved.length,
          hits: {
            hits: {
              total: { value: g.totalUnresolved ?? g.unresolved.length, relation: 'eq' },
              hits: g.unresolved.map((u) => ({
                _source: { entity: { id: u.id, namespace: u.namespace } },
              })),
            },
          },
        },
        existing_targets: {
          doc_count: g.existingTargets.length,
          target_ids: {
            buckets: g.existingTargets.map((t) => ({ key: t, doc_count: 1 })),
          },
        },
      })),
    },
  },
});

describe('Email rule resolution', () => {
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockLinkEntities: jest.Mock;
  let mockResolutionClient: ResolutionClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLinkEntities = jest
      .fn()
      .mockResolvedValue({ linked: ['alias-1'], skipped: [], target_id: 'target-1' });
    mockResolutionClient = { linkEntities: mockLinkEntities } as unknown as ResolutionClient;
    mockEsClient = {
      search: jest.fn(),
    } as unknown as jest.Mocked<ElasticsearchClient>;
  });

  describe('runEmailRuleResolution', () => {
    it('should perform a full scan when watermark is null', async () => {
      const state = createInitialState();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-1', namespace: 'okta' },
                { id: 'user-2', namespace: 'entra_id' },
              ],
              existingTargets: [],
            },
          ]) as any
        );

      await runEmailRuleResolution(createDeps(state, mockEsClient, mockResolutionClient));

      const step1Query = mockEsClient.search.mock.calls[0][0] as any;
      const filters = step1Query.query.bool.filter;
      const hasFirstSeenFilter = filters.some(
        (f: any) => f.range && f.range['entity.lifecycle.first_seen']
      );
      expect(hasFirstSeenFilter).toBe(false);
    });

    it('should include timestamp range filter for incremental scan', async () => {
      const state = createInitialState({ lastProcessedTimestamp: '2026-03-09T00:00:00Z' });
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-1', namespace: 'okta' },
                { id: 'user-2', namespace: 'entra_id' },
              ],
              existingTargets: [],
            },
          ]) as any
        );

      await runEmailRuleResolution(createDeps(state, mockEsClient, mockResolutionClient));

      const step1Query = mockEsClient.search.mock.calls[0][0] as any;
      const filters = step1Query.query.bool.filter;
      const firstSeenFilter = filters.find(
        (f: any) => f.range && f.range['entity.lifecycle.first_seen']
      );
      expect(firstSeenFilter).toEqual({
        range: { 'entity.lifecycle.first_seen': { gt: '2026-03-09T00:00:00Z' } },
      });
    });

    it('should return early when no new entities found', async () => {
      const state = createInitialState({ lastProcessedTimestamp: '2026-03-09T00:00:00Z' });
      mockEsClient.search.mockResolvedValueOnce(createCollectNewEmailsResponse([], '') as any);

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      expect(result.lastProcessedTimestamp).toBe('2026-03-09T00:00:00Z');
      expect(result.lastRun?.resolutionsCreated).toBe(0);
      expect(result.lastRun?.skippedAmbiguousBuckets).toBe(0);
      expect(mockEsClient.search).toHaveBeenCalledTimes(1);
    });

    it('should create new resolution group with 2+ unresolved entities', async () => {
      const state = createInitialState();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-okta', namespace: 'okta' },
                { id: 'user-entra', namespace: 'entra_id' },
              ],
              existingTargets: [],
            },
          ]) as any
        );

      mockLinkEntities.mockResolvedValueOnce({
        linked: ['user-entra'],
        skipped: [],
        target_id: 'user-okta',
      });

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      expect(mockLinkEntities).toHaveBeenCalledWith('user-okta', ['user-entra']);
      expect(result.lastRun?.resolutionsCreated).toBe(1);
    });

    it('should extend existing resolution group', async () => {
      const state = createInitialState();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [{ id: 'user-new', namespace: 'okta' }],
              existingTargets: ['user-existing-target'],
            },
          ]) as any
        );

      mockLinkEntities.mockResolvedValueOnce({
        linked: ['user-new'],
        skipped: [],
        target_id: 'user-existing-target',
      });

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      expect(mockLinkEntities).toHaveBeenCalledWith('user-existing-target', ['user-new']);
      expect(result.lastRun?.resolutionsCreated).toBe(1);
    });

    it('should skip ambiguous buckets with multiple existing targets', async () => {
      const state = createInitialState();
      const logger = loggerMock.create();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [{ id: 'user-new', namespace: 'okta' }],
              existingTargets: ['target-1', 'target-2'],
            },
          ]) as any
        );

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient, { logger })
      );

      expect(mockLinkEntities).not.toHaveBeenCalled();
      expect(result.lastRun?.skippedAmbiguousBuckets).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping ambiguous bucket')
      );
    });

    it('should include single-value filter in Step 1 query', async () => {
      const state = createInitialState();
      mockEsClient.search.mockResolvedValueOnce(createCollectNewEmailsResponse([], '') as any);

      await runEmailRuleResolution(createDeps(state, mockEsClient, mockResolutionClient));

      const step1Query = mockEsClient.search.mock.calls[0][0] as any;
      const scriptFilter = step1Query.query.bool.filter.find((f: any) =>
        f.script?.script?.source?.includes('size() == 1')
      );
      expect(scriptFilter).toBeDefined();
    });

    it('should include entity type scoping in both queries', async () => {
      const state = createInitialState();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(createFindMatchingGroupsResponse([]) as any);

      await runEmailRuleResolution(createDeps(state, mockEsClient, mockResolutionClient));

      // Step 1
      const step1Query = mockEsClient.search.mock.calls[0][0] as any;
      const step1TypeFilter = step1Query.query.bool.filter.find(
        (f: any) => f.term?.['entity.EngineMetadata.Type']
      );
      expect(step1TypeFilter).toEqual({ term: { 'entity.EngineMetadata.Type': 'user' } });

      // Step 2
      const step2Query = mockEsClient.search.mock.calls[1][0] as any;
      const step2TypeFilter = step2Query.query.bool.filter.find(
        (f: any) => f.term?.['entity.EngineMetadata.Type']
      );
      expect(step2TypeFilter).toEqual({ term: { 'entity.EngineMetadata.Type': 'user' } });
    });

    it('should handle ChainResolutionError by skipping group', async () => {
      const state = createInitialState();
      const logger = loggerMock.create();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-1', namespace: 'okta' },
                { id: 'user-2', namespace: 'entra_id' },
              ],
              existingTargets: [],
            },
          ]) as any
        );

      const { ChainResolutionError } = jest.requireActual('../../../domain/errors');
      mockLinkEntities.mockRejectedValueOnce(new ChainResolutionError('user-2', 'some-target'));

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient, { logger })
      );

      expect(result.lastRun?.resolutionsCreated).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve bucket'));
    });

    it('should advance watermark on success', async () => {
      const state = createInitialState();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T19:30:11.776Z') as any
        )
        .mockResolvedValueOnce(createFindMatchingGroupsResponse([]) as any);

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      expect(result.lastProcessedTimestamp).toBe('2026-03-10T19:30:11.776Z');
    });

    it('should not advance watermark when a bucket fails', async () => {
      const state = createInitialState({ lastProcessedTimestamp: '2026-03-09T00:00:00Z' });
      const logger = loggerMock.create();
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-1', namespace: 'okta' },
                { id: 'user-2', namespace: 'entra_id' },
              ],
              existingTargets: [],
            },
          ]) as any
        );

      mockLinkEntities.mockRejectedValueOnce(new Error('transient ES failure'));

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient, { logger })
      );

      // Watermark should NOT advance — stays at original value
      expect(result.lastProcessedTimestamp).toBe('2026-03-09T00:00:00Z');
      expect(result.lastRun?.resolutionsCreated).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve bucket'));
    });

    it('should advance watermark when all buckets succeed', async () => {
      const state = createInitialState({ lastProcessedTimestamp: '2026-03-09T00:00:00Z' });
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-1', namespace: 'okta' },
                { id: 'user-2', namespace: 'entra_id' },
              ],
              existingTargets: [],
            },
          ]) as any
        );

      mockLinkEntities.mockResolvedValueOnce({
        linked: ['user-2'],
        skipped: [],
        target_id: 'user-1',
      });

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      // Watermark should advance to maxTimestamp
      expect(result.lastProcessedTimestamp).toBe('2026-03-10T00:00:00Z');
    });

    it('should log warning when top_hits truncation occurs', async () => {
      const state = createInitialState();
      const logger = loggerMock.create();

      // Step 2 response has 2 unresolved hits but reports totalUnresolved = 150
      // (simulating top_hits capped at TOP_HITS_SIZE)
      mockEsClient.search
        .mockResolvedValueOnce(
          createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
        )
        .mockResolvedValueOnce(
          createFindMatchingGroupsResponse([
            {
              email: 'a@test.com',
              unresolved: [
                { id: 'user-1', namespace: 'okta' },
                { id: 'user-2', namespace: 'entra_id' },
              ],
              existingTargets: [],
              totalUnresolved: 150,
            },
          ]) as any
        );

      mockLinkEntities.mockResolvedValueOnce({
        linked: ['user-2'],
        skipped: [],
        target_id: 'user-1',
      });

      await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient, { logger })
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('150 unresolved entities but top_hits is capped at')
      );
    });

    it('should not advance watermark when no new entities found', async () => {
      const originalTimestamp = '2026-03-09T00:00:00Z';
      const state = createInitialState({ lastProcessedTimestamp: originalTimestamp });
      mockEsClient.search.mockResolvedValueOnce(createCollectNewEmailsResponse([], '') as any);

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      expect(result.lastProcessedTimestamp).toBe(originalTimestamp);
    });

    it('should return current state unchanged when aborted after Step 1', async () => {
      const state = createInitialState({ lastProcessedTimestamp: '2026-03-09T00:00:00Z' });
      const abortCtrl = new AbortController();
      abortCtrl.abort();

      mockEsClient.search.mockResolvedValueOnce(
        createCollectNewEmailsResponse(['a@test.com'], '2026-03-10T00:00:00Z') as any
      );

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient, {
          abortController: abortCtrl,
        })
      );

      expect(result.lastProcessedTimestamp).toBe('2026-03-09T00:00:00Z');
      expect(result.lastRun).toBeNull();
      expect(mockEsClient.search).toHaveBeenCalledTimes(1);
    });

    it('should paginate composite agg in Step 1', async () => {
      const state = createInitialState();

      mockEsClient.search
        .mockResolvedValueOnce({
          aggregations: {
            emails: {
              buckets: [
                { key: { email: 'a@test.com' }, doc_count: 1 },
                { key: { email: 'b@test.com' }, doc_count: 1 },
              ],
              after_key: { email: 'b@test.com' },
            },
            max_timestamp: { value_as_string: '2026-03-10T00:00:00Z' },
          },
        } as any)
        .mockResolvedValueOnce({
          aggregations: {
            emails: {
              buckets: [{ key: { email: 'c@test.com' }, doc_count: 1 }],
            },
            max_timestamp: { value_as_string: '2026-03-10T00:00:00Z' },
          },
        } as any)
        .mockResolvedValueOnce(createFindMatchingGroupsResponse([]) as any);

      const result = await runEmailRuleResolution(
        createDeps(state, mockEsClient, mockResolutionClient)
      );

      expect(result.lastRun?.resolutionsCreated).toBe(0);
      expect(mockEsClient.search).toHaveBeenCalledTimes(3);
    });
  });

  describe('selectTarget', () => {
    it('should prefer AD entity over Okta', () => {
      const entities: EntityHit[] = [
        { entityId: 'user-okta', namespace: 'okta' },
        { entityId: 'user-ad', namespace: 'active_directory' },
      ];
      expect(selectTarget(entities).entityId).toBe('user-ad');
    });

    it('should prefer Okta over Entra', () => {
      const entities: EntityHit[] = [
        { entityId: 'user-entra', namespace: 'entra_id' },
        { entityId: 'user-okta', namespace: 'okta' },
      ];
      expect(selectTarget(entities).entityId).toBe('user-okta');
    });

    it('should prefer Entra over unknown namespace', () => {
      const entities: EntityHit[] = [
        { entityId: 'user-github', namespace: 'github' },
        { entityId: 'user-entra', namespace: 'entra_id' },
      ];
      expect(selectTarget(entities).entityId).toBe('user-entra');
    });

    it('should use alphabetical tiebreaker among same namespace', () => {
      const entities: EntityHit[] = [
        { entityId: 'z-user@okta', namespace: 'okta' },
        { entityId: 'a-user@okta', namespace: 'okta' },
      ];
      expect(selectTarget(entities).entityId).toBe('a-user@okta');
    });

    it('should fall back to alphabetical first when no known namespace', () => {
      const entities: EntityHit[] = [
        { entityId: 'z-user@github', namespace: 'github' },
        { entityId: 'a-user@slack', namespace: 'slack' },
      ];
      expect(selectTarget(entities).entityId).toBe('a-user@slack');
    });

    it('should use exact match — substring of a known namespace does not match', () => {
      const entities: EntityHit[] = [
        { entityId: 'user-1', namespace: 'not_okta' },
        { entityId: 'user-2', namespace: 'active_directory_custom' },
      ];
      // Neither matches — falls back to alphabetical
      expect(selectTarget(entities).entityId).toBe('user-1');
    });
  });
});
