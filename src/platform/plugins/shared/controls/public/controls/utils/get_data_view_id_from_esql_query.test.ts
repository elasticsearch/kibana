/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getESQLAdHocDataview } from '@kbn/esql-utils';
import type { DataView } from '@kbn/data-views-plugin/common';
import { coreServices, dataViewsService } from '../../services/kibana_services';
import { getDataViewIdFromESQLQuery } from './get_data_view_id_from_esql_query';

jest.mock('@kbn/esql-utils', () => ({
  ...jest.requireActual('@kbn/esql-utils'),
  getESQLAdHocDataview: jest.fn(),
}));

const mockGetESQLAdHocDataview = getESQLAdHocDataview as jest.MockedFunction<
  typeof getESQLAdHocDataview
>;

describe('getDataViewIdFromESQLQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a matching preferred data view id before checking saved data views', async () => {
    dataViewsService.find = jest.fn();
    const preferredDataViews = [
      { id: 'published-data-view', getIndexPattern: () => 'logs-*' },
    ] as DataView[];

    await expect(
      getDataViewIdFromESQLQuery('FROM logs-* | STATS BY service.name', {
        preferredDataViews,
      })
    ).resolves.toBe('published-data-view');

    expect(dataViewsService.find).not.toHaveBeenCalled();
    expect(mockGetESQLAdHocDataview).not.toHaveBeenCalled();
  });

  it('returns the matching saved data view id', async () => {
    dataViewsService.find = jest.fn().mockResolvedValue([{ id: 'saved-data-view' }]);

    await expect(getDataViewIdFromESQLQuery('FROM logs-* | STATS BY service.name')).resolves.toBe(
      'saved-data-view'
    );

    expect(dataViewsService.find).toHaveBeenCalledWith('logs-*');
    expect(mockGetESQLAdHocDataview).not.toHaveBeenCalled();
  });

  it('creates an ad hoc data view when no saved data view matches', async () => {
    dataViewsService.find = jest.fn().mockResolvedValue([]);
    mockGetESQLAdHocDataview.mockResolvedValue({
      id: 'ad-hoc-data-view',
    } as Awaited<ReturnType<typeof getESQLAdHocDataview>>);

    await expect(getDataViewIdFromESQLQuery('FROM logs-* | STATS BY service.name')).resolves.toBe(
      'ad-hoc-data-view'
    );

    expect(mockGetESQLAdHocDataview).toHaveBeenCalledWith({
      dataViewsService,
      query: 'FROM logs-* | STATS BY service.name',
      http: coreServices.http,
    });
  });
});
