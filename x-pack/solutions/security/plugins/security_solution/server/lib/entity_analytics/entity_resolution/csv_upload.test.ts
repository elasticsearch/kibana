/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Readable } from 'stream';
import type { Logger } from '@kbn/logging';
import type { EntityStoreCRUDClient, ResolutionClient } from '@kbn/entity-store/server';
import type { Entity } from '@kbn/entity-store/common';
import { processResolutionCsvUpload } from './csv_upload';
import type { HapiReadableStream } from '../../../types';

const createMockStream = (csvContent: string): HapiReadableStream => {
  const stream = new Readable() as HapiReadableStream;
  stream.push(csvContent);
  stream.push(null);
  stream.hapi = { filename: 'test.csv' } as HapiReadableStream['hapi'];
  return stream;
};

const createMockEntity = (entityId: string, resolvedTo?: string): Entity =>
  ({
    entity: {
      id: entityId,
      ...(resolvedTo ? { relationships: { resolution: { resolved_to: resolvedTo } } } : {}),
    },
  } as unknown as Entity);

describe('processResolutionCsvUpload', () => {
  let mockCrudClient: jest.Mocked<EntityStoreCRUDClient>;
  let mockResolutionClient: jest.Mocked<ResolutionClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCrudClient = {
      listEntities: jest.fn().mockResolvedValue({ entities: [], nextSearchAfter: undefined }),
      updateEntity: jest.fn(),
      bulkUpdateEntity: jest.fn(),
      deleteEntity: jest.fn(),
    } as unknown as jest.Mocked<EntityStoreCRUDClient>;

    mockResolutionClient = {
      linkEntities: jest.fn().mockResolvedValue({ linked: [], skipped: [], target_id: '' }),
      unlinkEntities: jest.fn(),
      getResolutionGroup: jest.fn(),
    } as unknown as jest.Mocked<ResolutionClient>;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });

  const deps = () => ({
    crudClient: mockCrudClient,
    resolutionClient: mockResolutionClient,
    logger: mockLogger,
  });

  describe('row validation', () => {
    it('should reject invalid entity type', async () => {
      const csv = 'type,user.email,resolved_to\ninvalid,test@example.com,target:1';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.total).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.items[0].status).toBe('error');
      expect(result.items[0].error).toContain('Invalid entity type');
    });

    it('should reject generic entity type', async () => {
      const csv = 'type,user.email,resolved_to\ngeneric,thing@example.com,target:1';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.total).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.items[0].status).toBe('error');
      expect(result.items[0].error).toContain('Invalid entity type');
      expect(result.items[0].error).toContain('generic');
    });

    it('should reject missing resolved_to', async () => {
      const csv = 'type,user.email,resolved_to\nuser,test@example.com,';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].error).toContain('Missing resolved_to');
    });

    it('should reject row with no identity fields', async () => {
      const csv = 'type,resolved_to\nuser,target:1';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].error).toContain('No identifying fields');
    });

    it('should accept all valid entity types', async () => {
      // target exists for all rows
      mockCrudClient.listEntities.mockResolvedValue({
        entities: [createMockEntity('target:1')],
        nextSearchAfter: undefined,
      });

      const csv = [
        'type,user.name,resolved_to',
        'user,alice,target:1',
        'host,server1,target:1',
        'service,api,target:1',
      ].join('\n');

      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      // All pass validation (none fail with "Invalid entity type")
      const typeErrors = result.items.filter(
        (i) => i.error && i.error.includes('Invalid entity type')
      );
      expect(typeErrors).toHaveLength(0);
    });

    it('should ignore empty identity field values', async () => {
      const csv = 'type,user.email,user.name,resolved_to\nuser,,  ,target:1';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].error).toContain('No identifying fields');
    });
  });

  describe('target resolution', () => {
    it('should return error when target entity not found', async () => {
      const csv = 'type,user.email,resolved_to\nuser,test@example.com,target:missing';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].error).toContain("Target entity 'target:missing' not found");
    });

    it('should return error when target is an alias', async () => {
      mockCrudClient.listEntities.mockResolvedValue({
        entities: [createMockEntity('target:alias', 'target:golden')],
        nextSearchAfter: undefined,
      });

      const csv = 'type,user.email,resolved_to\nuser,test@example.com,target:alias';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].error).toContain("is an alias of 'target:golden'");
    });

    it('should cache target validation results', async () => {
      // Target exists and is valid
      mockCrudClient.listEntities.mockResolvedValue({
        entities: [createMockEntity('target:1')],
        nextSearchAfter: undefined,
      });

      const csv = [
        'type,user.email,resolved_to',
        'user,alice@test.com,target:1',
        'user,bob@test.com,target:1',
      ].join('\n');

      await processResolutionCsvUpload(createMockStream(csv), deps());

      // listEntities called for target lookup once (cached on second row),
      // plus once per row for entity matching = 3 total
      // First call: target lookup for row 1
      // Second call: entity matching for row 1
      // Third call: entity matching for row 2 (target lookup cached)
      expect(mockCrudClient.listEntities).toHaveBeenCalledTimes(3);
    });

    it('should cache invalid target results too', async () => {
      // Target not found
      mockCrudClient.listEntities.mockResolvedValue({
        entities: [],
        nextSearchAfter: undefined,
      });

      const csv = [
        'type,user.email,resolved_to',
        'user,alice@test.com,target:missing',
        'user,bob@test.com,target:missing',
      ].join('\n');

      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(2);
      // Only one listEntities call for the target (cached for second row)
      expect(mockCrudClient.listEntities).toHaveBeenCalledTimes(1);
    });
  });

  describe('entity matching', () => {
    beforeEach(() => {
      // First call: target lookup (valid target)
      // Subsequent calls: entity matching
      mockCrudClient.listEntities
        .mockResolvedValueOnce({
          entities: [createMockEntity('target:golden')],
          nextSearchAfter: undefined,
        })
        .mockResolvedValue({
          entities: [],
          nextSearchAfter: undefined,
        });
    });

    it('should return unmatched when no entities found', async () => {
      const csv = 'type,user.email,resolved_to\nuser,nobody@test.com,target:golden';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.unmatched).toBe(1);
      expect(result.items[0].status).toBe('unmatched');
    });

    it('should filter out the target entity from matches', async () => {
      mockCrudClient.listEntities
        .mockReset()
        // Target lookup
        .mockResolvedValueOnce({
          entities: [createMockEntity('target:golden')],
          nextSearchAfter: undefined,
        })
        // Entity matching: returns only the target itself
        .mockResolvedValueOnce({
          entities: [createMockEntity('target:golden')],
          nextSearchAfter: undefined,
        });

      const csv = 'type,user.email,resolved_to\nuser,golden@test.com,target:golden';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.unmatched).toBe(1);
      expect(result.items[0].matchedEntities).toBe(0);
    });

    it('should pass correct filters to listEntities', async () => {
      const csv = 'type,user.email,user.name,resolved_to\nuser,alice@test.com,alice,target:golden';
      await processResolutionCsvUpload(createMockStream(csv), deps());

      // Second call is the entity matching call
      const matchingCall = mockCrudClient.listEntities.mock.calls[1];
      expect(matchingCall[0]).toMatchObject({
        filter: expect.arrayContaining([
          { term: { 'entity.EngineMetadata.Type': 'user' } },
          { term: { 'user.email': 'alice@test.com' } },
          { term: { 'user.name': 'alice' } },
        ]),
        source: ['entity.id'],
      });
    });

    it('should error when matched entities exceed the limit', async () => {
      // Generate enough entities to exceed the 1000 limit
      const pageSize = 100;
      const pages = 11; // 11 pages × 100 = 1100 entities > 1000 limit

      mockCrudClient.listEntities.mockReset();
      // Target lookup
      mockCrudClient.listEntities.mockResolvedValueOnce({
        entities: [createMockEntity('target:golden')],
        nextSearchAfter: undefined,
      });
      // Entity matching pages
      for (let page = 0; page < pages; page++) {
        const entities = Array.from({ length: pageSize }, (_, i) =>
          createMockEntity(`alias:${page * pageSize + i}`)
        );
        mockCrudClient.listEntities.mockResolvedValueOnce({
          entities,
          nextSearchAfter: [page + 1, 0],
        });
      }

      const csv = 'type,user.email,resolved_to\nuser,common@test.com,target:golden';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].status).toBe('error');
      expect(result.items[0].error).toContain('Matched more than 1000 entities');
      expect(result.items[0].error).toContain('Narrow your identifying fields');
      expect(mockResolutionClient.linkEntities).not.toHaveBeenCalled();
    });

    it('should handle pagination', async () => {
      mockCrudClient.listEntities
        .mockReset()
        // Target lookup
        .mockResolvedValueOnce({
          entities: [createMockEntity('target:golden')],
          nextSearchAfter: undefined,
        })
        // First page of matches
        .mockResolvedValueOnce({
          entities: [createMockEntity('alias:1')],
          nextSearchAfter: [1234, 5678],
        })
        // Second page (empty = done)
        .mockResolvedValueOnce({
          entities: [createMockEntity('alias:2')],
          nextSearchAfter: undefined,
        });

      mockResolutionClient.linkEntities.mockResolvedValue({
        linked: ['alias:1', 'alias:2'],
        skipped: [],
        target_id: 'target:golden',
        entity_type: 'user',
      });

      const csv = 'type,user.email,resolved_to\nuser,shared@test.com,target:golden';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.items[0].matchedEntities).toBe(2);
      expect(result.items[0].linkedEntities).toBe(2);
      // 3 listEntities calls: 1 target + 2 pages
      expect(mockCrudClient.listEntities).toHaveBeenCalledTimes(3);
    });
  });

  describe('linking', () => {
    beforeEach(() => {
      // Target lookup returns valid target, then entity match returns one alias
      mockCrudClient.listEntities
        .mockResolvedValueOnce({
          entities: [createMockEntity('target:golden')],
          nextSearchAfter: undefined,
        })
        .mockResolvedValueOnce({
          entities: [createMockEntity('alias:1')],
          nextSearchAfter: undefined,
        });
    });

    it('should call linkEntities with correct args', async () => {
      mockResolutionClient.linkEntities.mockResolvedValue({
        linked: ['alias:1'],
        skipped: [],
        target_id: 'target:golden',
        entity_type: 'user',
      });

      const csv = 'type,user.email,resolved_to\nuser,alias@test.com,target:golden';
      await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(mockResolutionClient.linkEntities).toHaveBeenCalledWith('target:golden', ['alias:1']);
    });

    it('should report success with linked and skipped counts', async () => {
      mockResolutionClient.linkEntities.mockResolvedValue({
        linked: [],
        skipped: ['alias:1'],
        target_id: 'target:golden',
        entity_type: 'user',
      });

      const csv = 'type,user.email,resolved_to\nuser,alias@test.com,target:golden';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.successful).toBe(1);
      expect(result.items[0].linkedEntities).toBe(0);
      expect(result.items[0].skippedEntities).toBe(1);
    });

    it('should handle linkEntities errors gracefully', async () => {
      mockResolutionClient.linkEntities.mockRejectedValue(
        new Error('Chain resolution not allowed')
      );

      const csv = 'type,user.email,resolved_to\nuser,alias@test.com,target:golden';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.failed).toBe(1);
      expect(result.items[0].status).toBe('error');
      expect(result.items[0].matchedEntities).toBe(1);
      expect(result.items[0].error).toContain('Chain resolution not allowed');
    });
  });

  describe('CSV parsing', () => {
    it('should normalize headers to lowercase and trim whitespace', async () => {
      mockCrudClient.listEntities.mockResolvedValue({
        entities: [createMockEntity('target:1')],
        nextSearchAfter: undefined,
      });

      const csv = '  Type , User.Email ,Resolved_To \nuser,a@test.com,target:1';
      await processResolutionCsvUpload(createMockStream(csv), deps());

      const matchingCall = mockCrudClient.listEntities.mock.calls[1];
      expect(matchingCall[0]).toMatchObject({
        filter: expect.arrayContaining([{ term: { 'user.email': 'a@test.com' } }]),
      });
    });

    it('should trim values', async () => {
      mockCrudClient.listEntities.mockResolvedValue({
        entities: [createMockEntity('target:1')],
        nextSearchAfter: undefined,
      });

      const csv = 'type,user.email,resolved_to\n  user , a@test.com , target:1 ';
      await processResolutionCsvUpload(createMockStream(csv), deps());

      // Target lookup should use trimmed value
      const targetCall = mockCrudClient.listEntities.mock.calls[0];
      expect(targetCall[0]).toMatchObject({
        filter: [{ term: { 'entity.id': 'target:1' } }],
      });
    });

    it('should handle empty CSV', async () => {
      const csv = 'type,user.email,resolved_to\n';
      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.unmatched).toBe(0);
    });
  });

  describe('response aggregation', () => {
    it('should correctly aggregate mixed results', async () => {
      // Row 1: success (valid target + match)
      // Row 2: error (invalid type)
      // Row 3: unmatched (valid target, no matches)
      mockCrudClient.listEntities
        // Row 1: target lookup
        .mockResolvedValueOnce({
          entities: [createMockEntity('target:1')],
          nextSearchAfter: undefined,
        })
        // Row 1: entity matching
        .mockResolvedValueOnce({
          entities: [createMockEntity('alias:1')],
          nextSearchAfter: undefined,
        })
        // Row 3: target lookup (cached from row 1)
        // Row 3: entity matching
        .mockResolvedValueOnce({
          entities: [],
          nextSearchAfter: undefined,
        });

      mockResolutionClient.linkEntities.mockResolvedValue({
        linked: ['alias:1'],
        skipped: [],
        target_id: 'target:1',
        entity_type: 'user',
      });

      const csv = [
        'type,user.email,resolved_to',
        'user,alias@test.com,target:1',
        'invalid_type,foo@test.com,target:1',
        'user,nobody@test.com,target:1',
      ].join('\n');

      const result = await processResolutionCsvUpload(createMockStream(csv), deps());

      expect(result.total).toBe(3);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.unmatched).toBe(1);
      expect(result.items[0].status).toBe('success');
      expect(result.items[1].status).toBe('error');
      expect(result.items[2].status).toBe('unmatched');
    });
  });
});
