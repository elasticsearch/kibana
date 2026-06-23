/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  fromStoredDataViewToAsCodeSavedSchema,
  toStoredDataView,
} from '@kbn/as-code-data-views-transforms';
import { DataViewsAsCodeService } from './data_views_as_code_service';
import type { DataViewLazy, DataViewSpec } from '@kbn/data-views-plugin/common';
import { dataViewsService } from '@kbn/data-views-plugin/server/mocks';

const createMockDataViewLazy = ({
  id = 'test-id',
  managed = false,
  version = '1',
  namespaces = ['default'],
  spec = {},
}: {
  id?: string;
  managed?: boolean;
  version?: string;
  namespaces?: string[];
  spec?: Record<string, unknown>;
} = {}) =>
  ({
    id,
    managed,
    version,
    namespaces,
    toSpec: jest.fn().mockResolvedValue(spec),
  } as unknown as DataViewLazy);

const createService = () => {
  const service = new DataViewsAsCodeService(dataViewsService);
  return { service, mockDataViewsService: dataViewsService };
};

const getExpectedMappedData = (spec: DataViewSpec) => {
  const { id: _id, ...data } = fromStoredDataViewToAsCodeSavedSchema(spec);
  return data;
};

describe('DataViewsAsCodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return a mapped data view for a given id', async () => {
      const { service, mockDataViewsService } = createService();

      const mockSpec = { title: 'my-index-*', timeFieldName: '@timestamp' };
      const mockDataView = createMockDataViewLazy({
        id: 'dv-1',
        managed: true,
        version: '2',
        namespaces: ['default', 'space-1'],
        spec: mockSpec,
      });
      mockDataViewsService.getDataViewLazy.mockResolvedValue(mockDataView);

      const transformedData = getExpectedMappedData(mockSpec as DataViewSpec);

      const result = await service.get('dv-1');

      expect(mockDataViewsService.getDataViewLazy).toHaveBeenCalledWith('dv-1');
      expect(result).toEqual({
        id: 'dv-1',
        data: transformedData,
        meta: {
          managed: true,
          version: '2',
          namespaces: ['default', 'space-1'],
        },
      });
    });

    it('should propagate errors from getDataViewLazy', async () => {
      const { service, mockDataViewsService } = createService();

      const error = new Error('Data view not found');
      mockDataViewsService.getDataViewLazy.mockRejectedValue(error);

      await expect(service.get('non-existent')).rejects.toThrow('Data view not found');
      expect(mockDataViewsService.getDataViewLazy).toHaveBeenCalledWith('non-existent');
    });

    it('should handle a data view with default meta values', async () => {
      const { service, mockDataViewsService } = createService();

      const mockDataView = createMockDataViewLazy({
        id: 'dv-2',
        managed: false,
        namespaces: [],
        spec: { title: 'logs-*' },
      });
      mockDataViewsService.getDataViewLazy.mockResolvedValue(mockDataView);

      const result = await service.get('dv-2');

      expect(result).toEqual({
        id: 'dv-2',
        data: getExpectedMappedData({ title: 'logs-*' }),
        meta: {
          managed: false,
          version: '1',
          namespaces: [],
        },
      });
    });

    it('should omit id from data when the transform includes it', async () => {
      const { service, mockDataViewsService } = createService();

      const mockDataView = createMockDataViewLazy({
        id: 'dv-4',
        spec: { title: 'events-*', id: 'dv-4' },
      });
      mockDataViewsService.getDataViewLazy.mockResolvedValue(mockDataView);

      const result = await service.get('dv-4');

      expect(result).toEqual({
        id: 'dv-4',
        data: getExpectedMappedData({ title: 'events-*', id: 'dv-4' }),
        meta: {
          managed: false,
          version: '1',
          namespaces: ['default'],
        },
      });
    });

    it('should pass the spec from toSpec to the transform function', async () => {
      const { service, mockDataViewsService } = createService();

      const detailedSpec = {
        title: 'metrics-*',
        timeFieldName: '@timestamp',
        sourceFilters: [{ value: 'bytes' }],
        fieldFormats: { bytes: { id: 'number' } },
      };
      const mockDataView = createMockDataViewLazy({
        id: 'dv-3',
        spec: detailedSpec,
      });
      mockDataViewsService.getDataViewLazy.mockResolvedValue(mockDataView);

      const result = await service.get('dv-3');

      expect(result.data).toEqual(getExpectedMappedData(detailedSpec));
    });
  });

  describe('create', () => {
    it('should transform the spec, create and save the data view, and return mapped result', async () => {
      const { service, mockDataViewsService } = createService();

      const inputSpec = { id: 'dv-new', index_pattern: 'logs-*', time_field: '@timestamp' };
      const storedSpec = toStoredDataView(inputSpec) as DataViewSpec;

      const mockDataView = createMockDataViewLazy({
        id: 'dv-new',
        managed: false,
        version: '1',
        namespaces: ['default'],
        spec: storedSpec,
      });
      mockDataViewsService.createAndSaveDataViewLazy.mockResolvedValue(mockDataView);

      const transformedData = getExpectedMappedData(storedSpec);

      const result = await service.create(inputSpec);

      expect(mockDataViewsService.createAndSaveDataViewLazy).toHaveBeenCalledWith(storedSpec);
      expect(mockDataView.toSpec).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: 'dv-new',
        data: transformedData,
        meta: {
          managed: false,
          version: '1',
          namespaces: ['default'],
        },
      });
    });

    it('should propagate errors from createAndSaveDataViewLazy', async () => {
      const { service, mockDataViewsService } = createService();

      const error = new Error('Failed to create data view');
      mockDataViewsService.createAndSaveDataViewLazy.mockRejectedValue(error);

      await expect(service.create({ id: 'dv-fail', index_pattern: 'logs-*' })).rejects.toThrow(
        'Failed to create data view'
      );
    });

    it('should pass the transformed spec to createAndSaveDataViewLazy', async () => {
      const { service, mockDataViewsService } = createService();

      const inputSpec = {
        id: 'dv-complex',
        index_pattern: 'metrics-*',
        time_field: '@timestamp',
        field_filters: ['bytes'],
      };
      const transformedStoredSpec = toStoredDataView(inputSpec) as DataViewSpec;

      const mockDataView = createMockDataViewLazy({
        id: 'dv-complex',
        spec: transformedStoredSpec,
      });
      mockDataViewsService.createAndSaveDataViewLazy.mockResolvedValue(mockDataView);

      await service.create(inputSpec);

      expect(mockDataViewsService.createAndSaveDataViewLazy).toHaveBeenCalledWith(
        transformedStoredSpec
      );
    });

    it('should return correct meta from the created data view', async () => {
      const { service, mockDataViewsService } = createService();

      const mockDataView = createMockDataViewLazy({
        id: 'dv-meta',
        managed: true,
        version: '3',
        namespaces: ['default', 'space-a'],
        spec: { title: 'test-*' },
      });
      mockDataViewsService.createAndSaveDataViewLazy.mockResolvedValue(mockDataView);

      const result = await service.create({ id: 'dv-meta', index_pattern: 'test-*' });

      expect(result.meta).toEqual({
        managed: true,
        version: '3',
        namespaces: ['default', 'space-a'],
      });
    });
  });

  describe('delete', () => {
    it('should call delete for an existing id', async () => {
      const { service, mockDataViewsService } = createService();

      mockDataViewsService.delete.mockResolvedValue(undefined);

      await expect(service.delete('dv-existing')).resolves.toBeUndefined();
      expect(mockDataViewsService.delete).toHaveBeenCalledWith('dv-existing');
    });

    it('should propagate errors when deleting a non-existent id', async () => {
      const { service, mockDataViewsService } = createService();

      const error = new Error('Data view not found');
      mockDataViewsService.delete.mockRejectedValue(error);

      await expect(service.delete('dv-missing')).rejects.toThrow('Data view not found');
      expect(mockDataViewsService.delete).toHaveBeenCalledWith('dv-missing');
    });
  });
});
