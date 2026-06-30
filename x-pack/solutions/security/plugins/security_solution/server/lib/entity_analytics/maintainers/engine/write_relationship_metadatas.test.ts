/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { EntityMetadataClient } from '@kbn/entity-store/server';
import type { RelationshipMetadataDoc } from '@kbn/entity-store/common';

import { writeRelationshipMetadatas } from './write_relationship_metadatas';
import type { EntityRelationshipRecord } from './types';
import { LOOKBACK_WINDOW } from './constants';

// The maintainer documents what window it actually scanned over — assert
// against the constant, not a literal, so tests stay in lockstep with the
// engine if the lookback period ever changes.
const baseContext = {
  scanId: '11111111-1111-1111-1111-111111111111',
  lookbackWindow: LOOKBACK_WINDOW,
  entitySource: 'elastic_defend',
  observedAt: '2026-05-15T10:30:00.000Z',
};

const makeEntityMetadataClient = (
  failed: number = 0
): {
  entityMetadataClient: EntityMetadataClient;
  bulkAppend: jest.Mock;
} => {
  const bulkAppend = jest.fn().mockImplementation(async (docs: unknown[]) => ({
    successful: docs.length - failed,
    failed,
  }));
  const entityMetadataClient = {
    bulkAppendMetadata: bulkAppend,
  } as unknown as EntityMetadataClient;
  return { entityMetadataClient, bulkAppend };
};

const getDocsFromCall = (bulkAppend: jest.Mock): RelationshipMetadataDoc[] => {
  const [args] = bulkAppend.mock.calls;
  return args[0] as RelationshipMetadataDoc[];
};

describe('writeRelationshipMetadatas', () => {
  it('does not call the CRUD client when records is empty', async () => {
    const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
    await writeRelationshipMetadatas(entityMetadataClient, loggerMock.create(), [], baseContext);
    expect(bulkAppend).not.toHaveBeenCalled();
  });

  it('emits one doc per (entityId, relType, targetId) triple', async () => {
    const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { accesses_frequently: ['host:laptopA'] },
      },
    ];
    await writeRelationshipMetadatas(
      entityMetadataClient,
      loggerMock.create(),
      records,
      baseContext
    );
    const docs = getDocsFromCall(bulkAppend);
    expect(docs).toHaveLength(1);
  });

  it('fans one entity × one kind × multiple targets into one doc per target', async () => {
    const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: {
          accesses_frequently: ['host:laptopA', 'host:laptopB', 'host:laptopC'],
        },
      },
    ];
    await writeRelationshipMetadatas(
      entityMetadataClient,
      loggerMock.create(),
      records,
      baseContext
    );
    const docs = getDocsFromCall(bulkAppend);
    expect(docs).toHaveLength(3);
    const targets = docs.map((d) => d['entity.relationships.accesses_frequently.target']);
    expect(new Set(targets)).toEqual(new Set(['host:laptopA', 'host:laptopB', 'host:laptopC']));
  });

  it('fans multiple entities × multiple kinds × multiple targets correctly', async () => {
    const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: {
          accesses_frequently: ['host:H1', 'host:H2'],
          accesses_infrequently: ['host:H3'],
        },
      },
      {
        entityId: 'user:bob@corp',
        entityType: 'user',
        relationships: {
          accesses_frequently: ['host:H4'],
        },
      },
    ];
    await writeRelationshipMetadatas(
      entityMetadataClient,
      loggerMock.create(),
      records,
      baseContext
    );
    const docs = getDocsFromCall(bulkAppend);
    // 2 + 1 + 1 = 4 docs.
    expect(docs).toHaveLength(4);
    const sourceIds = docs.map((d) => d['entity.id']);
    expect(sourceIds.filter((id) => id === 'user:alice@corp')).toHaveLength(3);
    expect(sourceIds.filter((id) => id === 'user:bob@corp')).toHaveLength(1);
  });

  it('skips records with null entityId (cannot identify the source actor)', async () => {
    const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: null,
        entityType: 'user',
        relationships: { accesses_frequently: ['host:laptopA'] },
      },
    ];
    await writeRelationshipMetadatas(
      entityMetadataClient,
      loggerMock.create(),
      records,
      baseContext
    );
    expect(bulkAppend).not.toHaveBeenCalled();
  });

  it('skips records where every relationship array is empty (nothing to observe)', async () => {
    const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
    const records: EntityRelationshipRecord[] = [
      {
        entityId: 'user:alice@corp',
        entityType: 'user',
        relationships: { accesses_frequently: [], accesses_infrequently: [] },
      },
    ];
    await writeRelationshipMetadatas(
      entityMetadataClient,
      loggerMock.create(),
      records,
      baseContext
    );
    expect(bulkAppend).not.toHaveBeenCalled();
  });

  describe('doc field population', () => {
    let docs: RelationshipMetadataDoc[];

    beforeEach(async () => {
      const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:laptopA'] },
        },
      ];
      await writeRelationshipMetadatas(
        entityMetadataClient,
        loggerMock.create(),
        records,
        baseContext
      );
      docs = getDocsFromCall(bulkAppend);
    });

    it('sets @timestamp to context.observedAt', () => {
      expect(docs[0]['@timestamp']).toBe('2026-05-15T10:30:00.000Z');
    });

    it('sets event.kind to the literal "event"', () => {
      expect(docs[0]['event.kind']).toBe('event');
    });

    it('sets event.action to the literal "relationship_observed"', () => {
      expect(docs[0]['event.action']).toBe('relationship_observed');
    });

    it('sets entity.id to the source actor EUID', () => {
      expect(docs[0]['entity.id']).toBe('user:alice@corp');
    });

    it('sets entity.source to context.entitySource', () => {
      expect(docs[0]['entity.source']).toBe('elastic_defend');
    });

    it('sets entity.relationships.<kind>.target to the target EUID', () => {
      expect(docs[0]['entity.relationships.accesses_frequently.target']).toBe('host:laptopA');
    });

    it('sets Maintainer.kind to the relationship kind (relType)', () => {
      expect(docs[0].Maintainer.kind).toBe('accesses_frequently');
    });

    it('sets Maintainer.scan_id to context.scanId', () => {
      expect(docs[0].Maintainer.scan_id).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('sets Maintainer.lookback_window to context.lookbackWindow', () => {
      expect(docs[0].Maintainer.lookback_window).toBe(LOOKBACK_WINDOW);
    });

    it('does NOT set event.ingested (the ingest pipeline owns that field)', () => {
      expect(docs[0]['event.ingested']).toBeUndefined();
    });
  });

  describe('related.* flat lookup arrays', () => {
    it('populates related.user with the source actor username parsed from entity.id', async () => {
      const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:laptopA'] },
        },
      ];
      await writeRelationshipMetadatas(
        entityMetadataClient,
        loggerMock.create(),
        records,
        baseContext
      );
      const docs = getDocsFromCall(bulkAppend);
      expect(docs[0]['related.user']).toEqual(['alice']);
    });

    it('populates related.hosts with the target host name when the target EUID is a host', async () => {
      const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:laptopA'] },
        },
      ];
      await writeRelationshipMetadatas(
        entityMetadataClient,
        loggerMock.create(),
        records,
        baseContext
      );
      const docs = getDocsFromCall(bulkAppend);
      expect(docs[0]['related.hosts']).toEqual(['laptopA']);
    });

    it('omits related.hosts when the target EUID is not a host', async () => {
      const { entityMetadataClient, bulkAppend } = makeEntityMetadataClient();
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { communicates_with: ['user:bob@corp'] },
        },
      ];
      await writeRelationshipMetadatas(
        entityMetadataClient,
        loggerMock.create(),
        records,
        baseContext
      );
      const docs = getDocsFromCall(bulkAppend);
      expect(docs[0]['related.hosts']).toBeUndefined();
    });
  });

  describe('error propagation', () => {
    it('does NOT catch EntityMetadataClient exceptions — they propagate to the boundary', async () => {
      const entityMetadataClient = {
        bulkAppendMetadata: jest.fn().mockRejectedValue(new Error('bulk transport failure')),
      } as unknown as EntityMetadataClient;
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:laptopA'] },
        },
      ];
      await expect(
        writeRelationshipMetadatas(entityMetadataClient, loggerMock.create(), records, baseContext)
      ).rejects.toThrow(/bulk transport failure/);
    });

    it('logs at error level when bulkAppend reports failed items but does not throw', async () => {
      const logger = loggerMock.create();
      const { entityMetadataClient } = makeEntityMetadataClient(1);
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:laptopA'] },
        },
      ];
      await writeRelationshipMetadatas(entityMetadataClient, logger, records, baseContext);
      expect(logger.error).toHaveBeenCalled();
    });

    it('logs at info level (not error) when bulkAppend returns no failures', async () => {
      const logger = loggerMock.create();
      const { entityMetadataClient } = makeEntityMetadataClient();
      const records: EntityRelationshipRecord[] = [
        {
          entityId: 'user:alice@corp',
          entityType: 'user',
          relationships: { accesses_frequently: ['host:laptopA'] },
        },
      ];
      await writeRelationshipMetadatas(entityMetadataClient, logger, records, baseContext);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
