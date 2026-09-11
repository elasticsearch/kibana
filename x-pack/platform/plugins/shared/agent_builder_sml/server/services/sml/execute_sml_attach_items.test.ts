/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { loggerMock } from '@kbn/logging-mocks';
import type { SmlDocument, SmlService } from './types';
import { resolveSmlAttachItems } from './execute_sml_attach_items';

const createMockScopedClient = (): IScopedClusterClient =>
  ({
    asInternalUser: { search: jest.fn() } as unknown as ElasticsearchClient,
    asCurrentUser: { search: jest.fn() } as unknown as ElasticsearchClient,
  } as unknown as IScopedClusterClient);

const mockCheckItemsAccess = jest.fn();
const mockGetDocuments = jest.fn();
const mockGetTypeDefinition = jest.fn();

const createSmlService = (): SmlService =>
  ({
    checkItemsAccess: mockCheckItemsAccess,
    getDocuments: mockGetDocuments,
    getTypeDefinition: mockGetTypeDefinition,
  } as unknown as SmlService);

const createSmlDoc = ({
  id = 'entry-1',
  originUri = 'ref-1',
  ...overrides
}: Partial<Omit<SmlDocument, 'attributes'>> & {
  id?: string;
  originUri?: string;
} = {}): SmlDocument => ({
  type: 'visualization',
  title: 'Test Viz',
  content: 'content',
  permissions: { kibana: { privileges: [] } },
  attributes: {
    id,
    origin: { uri: originUri },
    created_at: '2024-01-01',
    updated_at: '2024-01-02',
    ingestion_method: 'crawled',
  },
  ...overrides,
});

const mockLogger = loggerMock.create();

const baseParams = {
  sml: createSmlService(),
  esClient: createMockScopedClient(),
  request: {} as KibanaRequest,
  spaceId: 'default',
  savedObjectsClient: {} as SavedObjectsClientContract,
  logger: mockLogger,
};

describe('resolveSmlAttachItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls checkItemsAccess with unique entry ids', async () => {
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', false]]));
    await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(mockCheckItemsAccess).toHaveBeenCalledWith({
      ids: ['entry-1'],
      spaceId: 'default',
      esClient: baseParams.esClient,
      request: baseParams.request,
    });
  });

  it('calls getDocuments with all unique entry ids', async () => {
    mockCheckItemsAccess.mockResolvedValue(
      new Map([
        ['a', true],
        ['b', false],
      ])
    );
    mockGetDocuments.mockResolvedValue(new Map());
    await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['a', 'b'],
    });
    expect(mockGetDocuments).toHaveBeenCalledWith({
      ids: ['a', 'b'],
      spaceId: 'default',
      esClient: baseParams.esClient,
    });
  });

  it('dedupes entry ids before access and document fetch', async () => {
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map());
    await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1', 'entry-1'],
    });
    expect(mockCheckItemsAccess).toHaveBeenCalledWith({
      ids: ['entry-1'],
      spaceId: 'default',
      esClient: baseParams.esClient,
      request: baseParams.request,
    });
    expect(mockGetDocuments).toHaveBeenCalledWith({
      ids: ['entry-1'],
      spaceId: 'default',
      esClient: baseParams.esClient,
    });
  });

  it('returns access denied when checkItemsAccess denies the entry', async () => {
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', false]]));
    mockGetDocuments.mockResolvedValue(new Map());
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].message).toContain('Access denied');
      expect(results[0].entry_id).toBe('entry-1');
    }
    expect(mockGetTypeDefinition).not.toHaveBeenCalled();
  });

  it('returns not found when document is missing from getDocuments', async () => {
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map());
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].message).toContain('not found in the index');
    }
    expect(mockGetTypeDefinition).not.toHaveBeenCalled();
  });

  it('returns a generic text attachment when getTypeDefinition is undefined (unregistered SML type)', async () => {
    const smlDoc = createSmlDoc({
      type: 'orphan-type',
      title: 'Ad-hoc note',
      content: 'free-form note body',
      originUri: 'orphan-type://note-1',
    });
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue(undefined);

    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });

    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].attachment).toEqual({
        type: 'text',
        data: { title: 'Ad-hoc note', content: 'free-form note body' },
        origin: 'orphan-type://note-1',
        description: 'orphan-type/Ad-hoc note',
      });
      expect(results[0].entry_id).toBe('entry-1');
    }
  });

  it('returns error when toAttachment returns undefined', async () => {
    const smlDoc = createSmlDoc();
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'visualization',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockResolvedValue(undefined),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].message).toContain('toAttachment returned undefined');
    }
  });

  it('returns attachment data on success without persisting', async () => {
    const smlDoc = createSmlDoc();
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'visualization',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockResolvedValue({
        type: 'visualization',
        data: { layers: [] },
        origin: 'custom-origin',
      }),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].attachment).toEqual({
        type: 'visualization',
        data: { layers: [] },
        origin: 'custom-origin',
        description: 'visualization/Test Viz',
      });
      expect(results[0].entry_id).toBe('entry-1');
    }
  });

  it('uses toAttachment description when provided', async () => {
    const smlDoc = createSmlDoc({ originUri: 'so-1' });
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'visualization',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockResolvedValue({
        type: 'visualization',
        data: { x: 1 },
        description: 'My asset',
      }),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].attachment).toEqual({
        type: 'visualization',
        data: { x: 1 },
        origin: 'so-1',
        description: 'My asset',
      });
    }
  });

  it('falls back to smlDoc type/title when toAttachment omits description', async () => {
    const smlDoc = createSmlDoc({
      type: 'connector',
      title: 'My Drive',
      originUri: 'so-1',
    });
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'connector',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockResolvedValue({
        type: 'connector',
        data: { connector_id: 'c1' },
      }),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].attachment.description).toBe('connector/My Drive');
    }
  });

  it('uses smlDoc.origin.uri when converted attachment has no origin', async () => {
    const smlDoc = createSmlDoc({ originUri: 'fallback-origin' });
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'visualization',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockResolvedValue({ type: 'visualization', data: {} }),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].attachment.origin).toBe('fallback-origin');
      expect(results[0].attachment.description).toBe('visualization/Test Viz');
    }
  });

  it('returns failure and logs when toAttachment throws', async () => {
    const smlDoc = createSmlDoc();
    mockCheckItemsAccess.mockResolvedValue(new Map([['entry-1', true]]));
    mockGetDocuments.mockResolvedValue(new Map([['entry-1', smlDoc]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'visualization',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-1'],
    });
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].message).toContain("Failed to convert SML item 'entry-1'");
    }
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('processes multiple entry ids independently', async () => {
    const docOk = createSmlDoc({ id: 'entry-ok', originUri: 'r-ok' });
    mockCheckItemsAccess.mockResolvedValue(
      new Map([
        ['entry-denied', false],
        ['entry-ok', true],
      ])
    );
    mockGetDocuments.mockResolvedValue(new Map([['entry-ok', docOk]]));
    mockGetTypeDefinition.mockReturnValue({
      id: 'visualization',
      list: jest.fn(),
      getSmlEntry: jest.fn(),
      toAttachment: jest.fn().mockResolvedValue({ type: 'visualization', data: {} }),
    });
    const results = await resolveSmlAttachItems({
      ...baseParams,
      entryIds: ['entry-denied', 'entry-ok'],
    });
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
    if (results[1].success) {
      expect(results[1].attachment).toEqual({
        type: 'visualization',
        data: {},
        origin: 'r-ok',
        description: 'visualization/Test Viz',
      });
    }
  });
});
