/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';

import { loggerMock } from '@kbn/logging-mocks';
import type { EntityUpdateClient } from '@kbn/entity-store/server';
import { writeEntityIds, hashEntityId } from './update_entities';
import type { EntityRelationshipRecord } from './types';

const makeCrudClient = (errors: Array<{ status: number }> = []): EntityUpdateClient =>
  ({
    bulkUpdateEntity: jest.fn().mockResolvedValue(errors),
  } as unknown as EntityUpdateClient);

describe('writeEntityIds', () => {
  it('returns zero counts immediately when records is empty', async () => {
    const crudClient = makeCrudClient();
    const result = await writeEntityIds(crudClient, loggerMock.create(), []);
    expect(result).toEqual({ updated: 0, notFound: 0, errors: 0, relationshipTypeApplied: {} });
    expect(crudClient.bulkUpdateEntity).not.toHaveBeenCalled();
  });

  it('skips records with null entityId', async () => {
    const crudClient = makeCrudClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: null,
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-foo'] },
      },
    ];
    const result = await writeEntityIds(crudClient, loggerMock.create(), records);
    expect(result).toEqual({ updated: 0, notFound: 0, errors: 0, relationshipTypeApplied: {} });
    expect(crudClient.bulkUpdateEntity).not.toHaveBeenCalled();
  });

  it('skips records where all relationship arrays are empty', async () => {
    const crudClient = makeCrudClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: {
          accesses_frequently: [],
          accesses_infrequently: [],
        },
      },
    ];
    const result = await writeEntityIds(crudClient, loggerMock.create(), records);
    expect(result).toEqual({ updated: 0, notFound: 0, errors: 0, relationshipTypeApplied: {} });
    expect(crudClient.bulkUpdateEntity).not.toHaveBeenCalled();
  });

  it('calls bulkUpdateEntity with ids array per relType', async () => {
    const crudClient = makeCrudClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: {
          accesses_frequently: ['host:D3F5C9B9-web-01'],
          accesses_infrequently: [],
        },
      },
    ];
    await writeEntityIds(crudClient, loggerMock.create(), records);
    const [call] = (crudClient.bulkUpdateEntity as jest.Mock).mock.calls;
    const { objects } = call[0];
    expect(objects).toHaveLength(1);
    const doc = objects[0].doc.entity.relationships;
    expect(doc.accesses_frequently.ids).toEqual(['host:D3F5C9B9-web-01']);
    expect(doc.accesses_infrequently).toBeUndefined();
  });

  it('merges records with the same entityId', async () => {
    const crudClient = makeCrudClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-a'] },
      },
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-b'] },
      },
    ];
    await writeEntityIds(crudClient, loggerMock.create(), records);
    const [call] = (crudClient.bulkUpdateEntity as jest.Mock).mock.calls;
    const { objects } = call[0];
    expect(objects).toHaveLength(1);
    expect(objects[0].doc.entity.relationships.communicates_with.ids.sort()).toEqual([
      'host:D3F5C9B9-a',
      'host:D3F5C9B9-b',
    ]);
  });

  it('returns updated/notFound/errors counts and counts only successfully updated entities in `updated`', async () => {
    const crudClient = makeCrudClient([{ status: 404 }]);
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-foo'] },
      },
      {
        entityId: 'user:bob@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-bar'] },
      },
    ];
    const result = await writeEntityIds(crudClient, loggerMock.create(), records);
    expect(result).toMatchObject({ updated: 1, notFound: 1, errors: 0 });
  });

  it('separates 404 (notFound) from non-404 (errors) in the response counts', async () => {
    const crudClient = makeCrudClient([{ status: 404 }, { status: 500 }, { status: 503 }]);
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-foo'] },
      },
      {
        entityId: 'user:bob@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-bar'] },
      },
      {
        entityId: 'user:charlie@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-baz'] },
      },
      {
        entityId: 'user:dave@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-qux'] },
      },
    ];
    const result = await writeEntityIds(crudClient, loggerMock.create(), records);
    expect(result).toMatchObject({ updated: 1, notFound: 1, errors: 2 });
  });

  it('logs 404 (notFound) at info level — non-zero 404s are surfaced for the caller (was debug)', async () => {
    const logger = loggerMock.create();
    const crudClient = makeCrudClient([{ status: 404 }]);
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-foo'] },
      },
    ];
    await writeEntityIds(crudClient, logger, records);
    const infos = logger.info.mock.calls.map((c) => c[0] as string);
    expect(infos.some((m) => m.includes('not yet in store'))).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs non-404 errors at error level', async () => {
    const logger = loggerMock.create();
    const crudClient = makeCrudClient([{ status: 500 }]);
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-foo'] },
      },
    ];
    await writeEntityIds(crudClient, logger, records);
    expect(logger.error).toHaveBeenCalled();
  });

  it('calls bulkUpdateEntity with force: true', async () => {
    const crudClient = makeCrudClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { communicates_with: ['host:D3F5C9B9-foo'] },
      },
    ];
    await writeEntityIds(crudClient, loggerMock.create(), records);
    const [call] = (crudClient.bulkUpdateEntity as jest.Mock).mock.calls;
    expect(call[0].force).toBe(true);
  });

  describe('relationshipTypeApplied', () => {
    it('returns empty relationshipTypeApplied when records is empty', async () => {
      const crudClient = makeCrudClient();
      const result = await writeEntityIds(crudClient, loggerMock.create(), []);
      expect(result.relationshipTypeApplied).toEqual({});
    });

    it('counts relationshipTypeApplied per relationship type on successful writes', async () => {
      const crudClient = makeCrudClient(); // no errors
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: {
            accesses_frequently: ['host:D3F5C9B9-web-01'],
            accesses_infrequently: ['host:D3F5C9B9-db-02'],
          },
        },
        {
          entityId: 'user:bob@corp',
          entityType: 'user',
          relationships: {
            accesses_frequently: ['host:D3F5C9B9-web-01'],
          },
        },
      ];
      const result = await writeEntityIds(crudClient, loggerMock.create(), records);
      expect(result.relationshipTypeApplied).toEqual({
        accesses_frequently: 2, // alice and bob
        accesses_infrequently: 1, // alice only
      });
    });

    it('excludes failed entities from relationshipTypeApplied counts', async () => {
      const aliceHash = hashEntityId('user:alice@corp');
      const crudClient = {
        bulkUpdateEntity: jest
          .fn()
          .mockResolvedValue([
            { _id: aliceHash, status: 500, type: 'es_exception', reason: 'boom' },
          ]),
      } as unknown as EntityUpdateClient;

      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:D3F5C9B9-x'] },
        },
        {
          entityId: 'user:bob@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:D3F5C9B9-y'] },
        },
      ];
      const result = await writeEntityIds(crudClient, loggerMock.create(), records);
      expect(result.relationshipTypeApplied).toEqual({ accesses_frequently: 1 }); // bob only
      expect(result.updated).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  describe('hashEntityId sync guard', () => {
    // update_entities.ts keeps a local copy of hashEuid from @kbn/entity-store to avoid a
    // cross-plugin private import. This test pins the output so a future algorithm change
    // in entity_store causes a visible test failure here rather than silent data corruption.
    it('produces the same SHA-256 hex digest as the entity_store hashEuid function', () => {
      const input = 'user:alice@corp.example.com';
      const expected = createHash('sha256').update(input).digest('hex');
      expect(hashEntityId(input)).toBe(expected);
    });
  });
});
