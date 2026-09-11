/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { first, firstValueFrom } from 'rxjs';
import { DataViewEditorService } from './data_view_editor_service';
import type { HttpSetup } from '@kbn/core/public';
import type { DataViewsServicePublic } from '@kbn/data-views-plugin/public';

const createService = (dataViewsOverrides: Partial<DataViewsServicePublic> = {}) =>
  new DataViewEditorService({
    services: {
      http: { get: jest.fn().mockResolvedValue({}) } as unknown as HttpSetup,
      dataViews: {
        getIdsWithTitle: jest.fn().mockResolvedValue([]),
        getRollupsEnabled: jest.fn().mockReturnValue(false),
        getIndices: jest.fn().mockResolvedValue([{ name: 'tracks', item: {} }]),
        getFieldsForWildcard: jest.fn().mockResolvedValue([]),
        ...dataViewsOverrides,
      } as unknown as DataViewsServicePublic,
    },
    initialValues: {},
  });

describe('DataViewEditorService', () => {
  it('should check for rollup indices when rolls are enabled', () => {
    const get = jest.fn();
    const http = { get } as unknown as HttpSetup;
    new DataViewEditorService({
      services: {
        http,
        dataViews: {
          getIdsWithTitle: jest.fn().mockResolvedValue([]),
          getRollupsEnabled: jest.fn().mockReturnValue(true),
        } as unknown as DataViewsServicePublic,
      },
      initialValues: {},
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toEqual('/api/rollup/indices');
  });
  it('should skip check for rollup indices when rollups are disabled', () => {
    const http = { get: jest.fn() } as unknown as HttpSetup;
    new DataViewEditorService({
      services: {
        http,
        dataViews: {
          getIdsWithTitle: jest.fn().mockResolvedValue([]),
          getRollupsEnabled: jest.fn().mockReturnValue(false),
        } as unknown as DataViewsServicePublic,
      },
      initialValues: {},
    });

    expect(http.get).toHaveBeenCalledTimes(0);
  });

  describe('timestamp fields', () => {
    it('should expose the failure when the field list request fails', async () => {
      const service = createService({
        getFieldsForWildcard: jest.fn().mockRejectedValue(new Error('Fields API is unavailable')),
      });

      service.setIndexPattern('tracks*');

      const error = await firstValueFrom(
        service.timestampFieldsError$.pipe(first((value) => value !== undefined))
      );

      expect(error?.message).toBe('Fields API is unavailable');
      expect(await firstValueFrom(service.timestampFieldOptions$)).toEqual([]);

      service.destroy();
    });

    it('should clear a previous failure once the field list request succeeds', async () => {
      const service = createService({
        getFieldsForWildcard: jest
          .fn()
          .mockRejectedValueOnce(new Error('Fields API is unavailable'))
          .mockResolvedValue([{ name: '@timestamp', type: 'date' }]),
      });

      service.setIndexPattern('tracks*');
      await firstValueFrom(
        service.timestampFieldsError$.pipe(first((value) => value !== undefined))
      );

      service.setIndexPattern('other*');
      const options = await firstValueFrom(
        service.timestampFieldOptions$.pipe(first((value) => value.length > 0))
      );

      expect(options.map(({ fieldName }) => fieldName)).toContain('@timestamp');
      expect(await firstValueFrom(service.timestampFieldsError$)).toBeUndefined();

      service.destroy();
    });
  });
});
