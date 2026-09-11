/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getBuckets } from './get_buckets';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';

describe('get buckets', () => {
  let clientSpy: jest.Mock;

  beforeEach(async () => {
    clientSpy = jest.fn().mockResolvedValueOnce({
      hits: {
        total: 100,
      },
      aggregations: {
        distribution: {
          buckets: [],
        },
      },
    });

    await getBuckets({
      environment: 'prod',
      serviceName: 'myServiceName',
      bucketSize: 10,
      kuery: '',
      apmEventClient: {
        search: clientSpy,
      } as any,
      start: 1528113600000,
      end: 1528977600000,
    });
  });

  it('should make the correct query', () => {
    expect(clientSpy.mock.calls).toMatchSnapshot();
  });

  it('should limit query results to error documents', () => {
    const query = clientSpy.mock.calls[0][1];
    expect(query.apm.sources).toEqual([
      {
        documentType: ApmDocumentType.ErrorEvent,
        rollupInterval: RollupInterval.None,
      },
    ]);
  });
});
