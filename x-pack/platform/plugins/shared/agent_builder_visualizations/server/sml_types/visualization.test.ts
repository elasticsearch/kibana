/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { SmlListItem } from '@kbn/agent-context-layer-plugin/server';
import { visualizationSmlType } from './visualization';

jest.mock('@kbn/lens-embeddable-utils', () => ({
  LensConfigBuilder: jest.fn().mockImplementation(() => ({
    toAPIFormat: jest.fn().mockReturnValue({ type: 'lnsXY', layers: [] }),
  })),
}));

const mockSavedObjectsClient = {
  createPointInTimeFinder: jest.fn(),
  find: jest.fn(),
  get: jest.fn(),
  resolve: jest.fn(),
};

const createContext = () => ({
  savedObjectsClient: mockSavedObjectsClient,
  logger: loggingSystemMock.createLogger(),
});

async function collectPages(iterable: AsyncIterable<SmlListItem[]>): Promise<SmlListItem[]> {
  const items: SmlListItem[] = [];
  for await (const page of iterable) {
    items.push(...page);
  }
  return items;
}

describe('visualizationSmlType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('id', () => {
    it('equals visualization', () => {
      expect(visualizationSmlType.id).toBe('visualization');
    });
  });

  describe('list', () => {
    it('calls createPointInTimeFinder with type lens, namespaces [*], fields [title]', async () => {
      mockSavedObjectsClient.createPointInTimeFinder.mockReturnValue({
        async *find() {
          yield { saved_objects: [] };
        },
        close: jest.fn(),
      });

      await collectPages(visualizationSmlType.list(createContext() as never));

      expect(mockSavedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith({
        type: 'lens',
        perPage: 1000,
        namespaces: ['*'],
        fields: ['title'],
      });
    });

    it('returns items with id, updatedAt from so.updated_at, spaces from so.namespaces', async () => {
      const savedObjects = [
        {
          id: 'viz-1',
          type: 'lens',
          attributes: {},
          references: [],
          updated_at: '2024-01-01T00:00:00Z',
          namespaces: ['default', 'space-1'],
        },
      ];
      const closeMock = jest.fn();
      mockSavedObjectsClient.createPointInTimeFinder.mockReturnValue({
        async *find() {
          yield { saved_objects: savedObjects };
        },
        close: closeMock,
      });

      const result = await collectPages(visualizationSmlType.list(createContext() as never));

      expect(result).toEqual([
        {
          id: 'viz-1',
          updatedAt: '2024-01-01T00:00:00Z',
          spaces: ['default', 'space-1'],
        },
      ]);
      expect(closeMock).toHaveBeenCalled();
    });

    it('defaults updatedAt to current date when so.updated_at is undefined', async () => {
      const savedObjects = [
        {
          id: 'viz-2',
          type: 'lens',
          attributes: {},
          references: [],
          updated_at: undefined,
          namespaces: ['default'],
        },
      ];
      mockSavedObjectsClient.createPointInTimeFinder.mockReturnValue({
        async *find() {
          yield { saved_objects: savedObjects };
        },
        close: jest.fn(),
      });

      const result = await collectPages(visualizationSmlType.list(createContext() as never));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('viz-2');
      expect(result[0].updatedAt).toBeDefined();
      expect(new Date(result[0].updatedAt).getTime()).not.toBeNaN();
    });

    it('defaults spaces to [] when so.namespaces is undefined', async () => {
      const savedObjects = [
        {
          id: 'viz-3',
          type: 'lens',
          attributes: {},
          references: [],
          updated_at: '2024-02-01T00:00:00Z',
          namespaces: undefined,
        },
      ];
      mockSavedObjectsClient.createPointInTimeFinder.mockReturnValue({
        async *find() {
          yield { saved_objects: savedObjects };
        },
        close: jest.fn(),
      });

      const result = await collectPages(visualizationSmlType.list(createContext() as never));

      expect(result).toEqual([
        {
          id: 'viz-3',
          updatedAt: '2024-02-01T00:00:00Z',
          spaces: [],
        },
      ]);
    });
  });

  describe('getSmlData', () => {
    it('returns chunk with correct type, title, content, permissions', async () => {
      const savedObject = {
        id: 'viz-1',
        type: 'lens',
        attributes: {
          title: 'My Visualization',
          description: 'A test viz',
          visualizationType: 'lnsXY',
          state: {
            datasourceStates: {
              textBased: {
                layers: {
                  layer1: { query: { esql: 'FROM test' } },
                },
              },
            },
          },
        },
        references: [],
        updated_at: '2024-01-01T00:00:00Z',
        namespaces: ['default', 'space-1'],
      };
      mockSavedObjectsClient.get.mockResolvedValue(savedObject);

      const result = await visualizationSmlType.getSmlData!('viz-1', createContext() as never);

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('lens', 'viz-1');
      expect(result).toEqual({
        chunks: [
          {
            type: 'visualization',
            title: 'My Visualization',
            content: 'My Visualization\nA test viz\nlnsXY\nFROM test',
            permissions: {
              kibana: { privileges: [{ name: 'saved_object:lens/get' }] },
              elasticsearch: { indices: [] },
            },
          },
        ],
      });
    });

    it('content includes title, description, chartType, esql joined by newline', async () => {
      const savedObject = {
        id: 'viz-2',
        type: 'lens',
        attributes: {
          title: 'Sales Chart',
          description: 'Monthly sales',
          visualizationType: 'lnsPie',
          state: {
            datasourceStates: {
              textBased: {
                layers: {
                  layer1: { query: { esql: 'FROM sales | STATS sum(amount)' } },
                },
              },
            },
          },
        },
        references: [],
        updated_at: '2024-01-01T00:00:00Z',
        namespaces: ['default'],
      };
      mockSavedObjectsClient.get.mockResolvedValue(savedObject);

      const result = await visualizationSmlType.getSmlData!('viz-2', createContext() as never);

      expect(result!.chunks[0].content).toBe(
        'Sales Chart\nMonthly sales\nlnsPie\nFROM sales | STATS sum(amount)'
      );
    });

    it('returns undefined on error when savedObjectsClient.get throws', async () => {
      mockSavedObjectsClient.get.mockRejectedValue(new Error('Not found'));
      const context = createContext();

      const result = await visualizationSmlType.getSmlData!('missing-viz', context as never);

      expect(result).toBeUndefined();
      expect(context.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("failed to get data for 'missing-viz'")
      );
    });

    it('handles missing optional fields: no description, no esql', async () => {
      const savedObject = {
        id: 'viz-minimal',
        type: 'lens',
        attributes: {
          title: 'Minimal Viz',
          visualizationType: 'lnsXY',
        },
        references: [],
        updated_at: '2024-01-01T00:00:00Z',
        namespaces: ['default'],
      };
      mockSavedObjectsClient.get.mockResolvedValue(savedObject);

      const result = await visualizationSmlType.getSmlData!(
        'viz-minimal',
        createContext() as never
      );

      expect(result!.chunks[0]).toEqual({
        type: 'visualization',
        title: 'Minimal Viz',
        content: 'Minimal Viz\nlnsXY',
        permissions: {
          kibana: { privileges: [{ name: 'saved_object:lens/get' }] },
          elasticsearch: { indices: [] },
        },
      });
    });
  });

  describe('toAttachment', () => {
    it('calls resolve with lens and item.origin_id', async () => {
      const savedObject = {
        id: 'viz-1',
        type: 'lens',
        attributes: {
          title: 'My Visualization',
          description: 'A test viz',
          visualizationType: 'lnsXY',
          state: {
            datasourceStates: {
              textBased: {
                layers: {
                  layer1: { query: { esql: 'FROM test' } },
                },
              },
            },
          },
        },
        references: [],
        updated_at: '2024-01-01T00:00:00Z',
        namespaces: ['default'],
      };
      mockSavedObjectsClient.resolve.mockResolvedValue({
        saved_object: savedObject,
        outcome: 'exactMatch',
      });

      await visualizationSmlType.toAttachment!(
        { origin_id: 'viz-1' } as never,
        createContext() as never
      );

      expect(mockSavedObjectsClient.resolve).toHaveBeenCalledWith('lens', 'viz-1');
    });

    it('returns visualization attachment with correct shape', async () => {
      const savedObject = {
        id: 'viz-1',
        type: 'lens',
        attributes: {
          title: 'My Visualization',
          description: 'A test viz',
          visualizationType: 'lnsXY',
          state: {
            datasourceStates: {
              textBased: {
                layers: {
                  layer1: { query: { esql: 'FROM test' } },
                },
              },
            },
          },
        },
        references: [],
        updated_at: '2024-01-01T00:00:00Z',
        namespaces: ['default'],
      };
      mockSavedObjectsClient.resolve.mockResolvedValue({
        saved_object: savedObject,
        outcome: 'exactMatch',
      });

      const result = await visualizationSmlType.toAttachment!(
        { origin_id: 'viz-1' } as never,
        createContext() as never
      );

      expect(result).toEqual({
        type: 'visualization',
        data: {
          query: 'My Visualization',
          visualization: { type: 'lnsXY', layers: [] },
          chart_type: 'lnsXY',
          esql: 'FROM test',
        },
      });
    });

    it('returns undefined when resolve result has error', async () => {
      mockSavedObjectsClient.resolve.mockResolvedValue({
        saved_object: {
          id: 'viz-1',
          type: 'lens',
          error: { message: 'Not found' },
        },
        outcome: 'exactMatch',
      });

      const result = await visualizationSmlType.toAttachment!(
        { origin_id: 'viz-1' } as never,
        createContext() as never
      );

      expect(result).toBeUndefined();
    });

    it('propagates errors from resolve to the caller', async () => {
      mockSavedObjectsClient.resolve.mockRejectedValue(new Error('Connection failed'));

      await expect(
        visualizationSmlType.toAttachment!(
          { origin_id: 'viz-1' } as never,
          createContext() as never
        )
      ).rejects.toThrow('Connection failed');
    });

    it('uses LensConfigBuilder to convert attributes', async () => {
      const { LensConfigBuilder } = jest.requireMock('@kbn/lens-embeddable-utils');
      const toAPIFormatMock = jest.fn().mockReturnValue({
        type: 'lnsPie',
        layers: [{ id: 'layer1' }],
      });
      (LensConfigBuilder as jest.Mock).mockImplementation(() => ({
        toAPIFormat: toAPIFormatMock,
      }));

      const savedObject = {
        id: 'viz-1',
        type: 'lens',
        attributes: {
          title: 'Pie Chart',
          visualizationType: 'lnsPie',
        },
        references: [],
        updated_at: '2024-01-01T00:00:00Z',
        namespaces: ['default'],
      };
      mockSavedObjectsClient.resolve.mockResolvedValue({
        saved_object: savedObject,
        outcome: 'exactMatch',
      });

      const result = await visualizationSmlType.toAttachment!(
        { origin_id: 'viz-1' } as never,
        createContext() as never
      );

      expect(LensConfigBuilder).toHaveBeenCalled();
      expect(toAPIFormatMock).toHaveBeenCalled();
      const data = result!.data as Record<string, unknown>;
      expect(data.visualization).toEqual({
        type: 'lnsPie',
        layers: [{ id: 'layer1' }],
      });
      expect(data.chart_type).toBe('lnsPie');
    });
  });
});
