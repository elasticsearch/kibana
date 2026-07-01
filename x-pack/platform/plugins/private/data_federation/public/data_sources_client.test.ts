/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';

import type { DataSourceWithSecrets } from '../common';
import { DATA_SOURCES_LIST_ROUTE_PATH, getDataSourceByIdApiPath, type DataSource } from '../common';
import { DataSourcesClient } from './data_sources_client';

const createHttpMock = (): Pick<HttpStart, 'get' | 'put' | 'delete'> => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
});

describe('DataSourcesClient', () => {
  describe('get', () => {
    it('returns the data_sources array from the response body', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      const sources: DataSource[] = [
        { type: 's3', name: 'a', description: '', settings: {} },
        { type: 'gcs', name: 'b', description: '', settings: {} },
      ];

      (http.get as jest.Mock).mockResolvedValue({ data_sources: sources });

      await expect(client.get()).resolves.toEqual(sources);
      expect(http.get).toHaveBeenCalledWith(DATA_SOURCES_LIST_ROUTE_PATH);
    });
  });

  describe('getById', () => {
    it('throws when id is empty/whitespace', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      await expect(client.getById('  ')).rejects.toThrow('Name is required.');
    });

    it('trims the id and calls http.get with the id path', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      const response: DataSource = { type: 's3', name: 'x', description: '', settings: {} };
      (http.get as jest.Mock).mockResolvedValue(response);

      await expect(client.getById('  my_id  ')).resolves.toEqual(response);
      expect(http.get).toHaveBeenCalledWith(getDataSourceByIdApiPath('my_id'));
    });
  });

  describe('add', () => {
    it('throws when name is empty/whitespace', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      const data: DataSourceWithSecrets = {
        type: 's3',
        name: '   ',
        description: '',
        settings: {},
      };

      await expect(client.add(data)).rejects.toThrow('Name is required.');
      expect(http.put).not.toHaveBeenCalled();
    });

    it('PUTs to the id route and omits empty settings fields', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      const data: DataSourceWithSecrets = {
        type: 's3',
        name: '  ds1  ',
        description: '',
        settings: {
          region: '',
          endpoint: 'https://s3.example',
          auth: '',
          access_key: '',
          secret_key: 'SECRET',
          role_arn: undefined,
          jwt_audience: undefined,
          role_session_name: '',
          sts_endpoint: '',
          sts_region: '',
        },
      };

      (http.put as jest.Mock).mockResolvedValue(undefined);

      await expect(client.add(data)).resolves.toBeUndefined();

      const expectedBody = {
        type: 's3',
        description: '',
        settings: {
          endpoint: 'https://s3.example',
          secret_key: 'SECRET',
        },
      };

      expect(http.put).toHaveBeenCalledWith(getDataSourceByIdApiPath('ds1'), {
        body: JSON.stringify(expectedBody),
      });
    });
  });

  describe('delete', () => {
    it('deletes a single name', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      (http.delete as jest.Mock).mockResolvedValue(undefined);

      await expect(client.delete('a')).resolves.toBeUndefined();
      expect(http.delete).toHaveBeenCalledWith(getDataSourceByIdApiPath('a'));
    });

    it('deletes each name in the list', async () => {
      const http = createHttpMock();
      const client = new DataSourcesClient(http as unknown as HttpStart);

      (http.delete as jest.Mock).mockResolvedValue(undefined);

      await expect(client.delete(['a', 'b'])).resolves.toBeUndefined();
      expect(http.delete).toHaveBeenNthCalledWith(1, getDataSourceByIdApiPath('a'));
      expect(http.delete).toHaveBeenNthCalledWith(2, getDataSourceByIdApiPath('b'));
    });
  });
});
