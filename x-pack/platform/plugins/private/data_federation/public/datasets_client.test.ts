/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';

import type { DataSetWithName } from '../common';
import { DATA_SETS_LIST_ROUTE_PATH, getDataSetByIdApiPath } from '../common';
import { DatasetsClient } from './datasets_client';

const createHttpMock = (): Pick<HttpStart, 'get' | 'put' | 'delete'> => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
});

describe('DatasetsClient', () => {
  describe('get', () => {
    it('returns the data_sets array from the response body', async () => {
      const http = createHttpMock();
      const client = new DatasetsClient(http as unknown as HttpStart);

      const sets: DataSetWithName[] = [
        { name: 'a', data_source: 'ds', resource: 'r', description: '' },
      ];
      (http.get as jest.Mock).mockResolvedValue({ data_sets: sets });

      await expect(client.get()).resolves.toEqual(sets);
      expect(http.get).toHaveBeenCalledWith(DATA_SETS_LIST_ROUTE_PATH);
    });
  });

  describe('add', () => {
    it('throws when name is empty/whitespace', async () => {
      const http = createHttpMock();
      const client = new DatasetsClient(http as unknown as HttpStart);

      const data: DataSetWithName = {
        name: '   ',
        data_source: 'ds',
        resource: 'r',
        description: '',
      };

      await expect(client.add(data)).rejects.toThrow('Name is required.');
      expect(http.put).not.toHaveBeenCalled();
    });

    it('PUTs to the id route and omits empty settings fields', async () => {
      const http = createHttpMock();
      const client = new DatasetsClient(http as unknown as HttpStart);

      const data: DataSetWithName = {
        name: '  set1  ',
        data_source: 'ds',
        resource: 'r',
        description: '',
        settings: {
          error_mode: undefined,
          partition_detection: 'hive',
        },
      };

      (http.put as jest.Mock).mockResolvedValue(undefined);

      await expect(client.add(data)).resolves.toBeUndefined();

      const expectedBody = {
        data_source: 'ds',
        resource: 'r',
        description: '',
        settings: {
          partition_detection: 'hive',
        },
      };

      expect(http.put).toHaveBeenCalledWith(getDataSetByIdApiPath('set1'), {
        body: JSON.stringify(expectedBody),
      });
    });

    it('omits settings entirely when undefined', async () => {
      const http = createHttpMock();
      const client = new DatasetsClient(http as unknown as HttpStart);

      const data: DataSetWithName = {
        name: 'set2',
        data_source: 'ds',
        resource: 'r',
        description: '',
      };

      (http.put as jest.Mock).mockResolvedValue(undefined);

      await expect(client.add(data)).resolves.toBeUndefined();
      expect(http.put).toHaveBeenCalledWith(getDataSetByIdApiPath('set2'), {
        body: JSON.stringify({
          data_source: 'ds',
          resource: 'r',
          description: '',
        }),
      });
    });
  });

  describe('delete', () => {
    it('deletes a single name', async () => {
      const http = createHttpMock();
      const client = new DatasetsClient(http as unknown as HttpStart);

      (http.delete as jest.Mock).mockResolvedValue(undefined);

      await expect(client.delete('a')).resolves.toBeUndefined();
      expect(http.delete).toHaveBeenCalledWith(getDataSetByIdApiPath('a'));
    });

    it('deletes each name in the list', async () => {
      const http = createHttpMock();
      const client = new DatasetsClient(http as unknown as HttpStart);

      (http.delete as jest.Mock).mockResolvedValue(undefined);

      await expect(client.delete(['a', 'b'])).resolves.toBeUndefined();
      expect(http.delete).toHaveBeenNthCalledWith(1, getDataSetByIdApiPath('a'));
      expect(http.delete).toHaveBeenNthCalledWith(2, getDataSetByIdApiPath('b'));
    });
  });
});
