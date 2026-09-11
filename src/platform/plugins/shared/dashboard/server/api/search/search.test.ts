/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { findWithTagFilter } from '@kbn/as-code-utils';
import type { RequestHandlerContext } from '@kbn/core/server';

import { search } from './search';

jest.mock('@kbn/as-code-utils', () => ({
  findWithTagFilter: jest.fn(),
}));

jest.mock('../transforms', () => ({
  transformDashboardOut: jest.fn().mockReturnValue({
    dashboardState: {
      title: 'Test',
      description: undefined,
      tags: undefined,
      time_range: undefined,
    },
  }),
}));

const findWithTagFilterMock = findWithTagFilter as jest.MockedFunction<typeof findWithTagFilter>;

const createRequestCtx = (): RequestHandlerContext =>
  ({
    loadPluginContract: jest.fn(),
    resolve: jest.fn().mockResolvedValue({
      core: { savedObjects: { client: {} } },
    }),
  } as unknown as RequestHandlerContext);

describe('dashboard search sort options', () => {
  beforeEach(() => {
    findWithTagFilterMock.mockResolvedValue({
      saved_objects: [],
      total: 0,
      page: 1,
      per_page: 20,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes updated_at desc when query is omitted', async () => {
    await search(createRequestCtx(), { page: 1, per_page: 20 }, jest.fn() as never);

    expect(findWithTagFilterMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        sortField: 'updated_at',
        sortOrder: 'desc',
      })
    );
  });

  it('omits sort options when query is present', async () => {
    await search(createRequestCtx(), { page: 1, per_page: 20, query: 'sales' }, jest.fn() as never);

    const findOptions = findWithTagFilterMock.mock.calls[0][1];
    expect(findOptions).not.toHaveProperty('sortField');
    expect(findOptions).not.toHaveProperty('sortOrder');
    expect(findOptions).toHaveProperty('search');
  });
});
