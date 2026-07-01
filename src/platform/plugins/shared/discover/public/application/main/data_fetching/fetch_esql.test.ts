/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getDocId, type EsHitRecord } from '@kbn/discover-utils';
import type { ExecutionContract } from '@kbn/expressions-plugin/common';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import moment from 'moment';
import { of } from 'rxjs';
import { dataViewWithTimefieldMock } from '../../../__mocks__/data_view_with_timefield';
import { discoverServiceMock } from '../../../__mocks__/services';
import { fetchEsql, getTextBasedQueryStateToAstProps } from './fetch_esql';
import type { TimeRange } from '@kbn/es-query';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../context_awareness';

describe('fetchEsql', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const scopedProfilesManager = discoverServiceMock.profilesManager.createScopedProfilesManager({
    scopedEbtManager: discoverServiceMock.ebtManager.createScopedEBTManager(),
    toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
  });
  const fetchEsqlMockProps = {
    query: { esql: 'from *' },
    dataView: dataViewWithTimefieldMock,
    inspectorAdapters: { requests: new RequestAdapter() },
    data: discoverServiceMock.data,
    expressions: discoverServiceMock.expressions,
    scopedProfilesManager,
  };

  it('resolves with returned records', async () => {
    const hits = [
      { _index: 'i', _id: '1', foo: 'bar' },
      { _index: 'i', _id: '2', foo: 'baz' },
    ] as unknown as EsHitRecord[];
    const records = hits.map((hit) => ({
      id: getDocId(hit),
      raw: hit,
      flattened: hit,
    }));
    const expressionsExecuteSpy = jest.spyOn(discoverServiceMock.expressions, 'execute');
    expressionsExecuteSpy.mockReturnValueOnce({
      cancel: jest.fn(),
      getData: jest.fn(() =>
        of({
          result: {
            columns: ['_id', 'foo'],
            rows: hits,
          },
        })
      ),
    } as unknown as ExecutionContract);
    const resolveDocumentProfileSpy = jest.spyOn(scopedProfilesManager, 'resolveDocumentProfile');
    expect(await fetchEsql(fetchEsqlMockProps)).toEqual({
      records,
      esqlQueryColumns: ['_id', 'foo'],
      esqlHeaderWarning: undefined,
      interceptedWarnings: [],
    });
    expect(resolveDocumentProfileSpy).toHaveBeenCalledTimes(2);
    expect(resolveDocumentProfileSpy).toHaveBeenCalledWith({ record: records[0] });
    expect(resolveDocumentProfileSpy).toHaveBeenCalledWith({ record: records[1] });
  });

  it('falls back to generated ids when row metadata is missing', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 7, 22, 34, 46));

    try {
      const hits = [
        { _id: '1', foo: 'bar' },
        { _id: '2', foo: 'baz' },
      ] as unknown as EsHitRecord[];
      const responseTime = moment().format('YYYY-MM-DD_HH_mm_ss');
      const expressionsExecuteSpy = jest.spyOn(discoverServiceMock.expressions, 'execute');
      expressionsExecuteSpy.mockReturnValueOnce({
        cancel: jest.fn(),
        getData: jest.fn(() =>
          of({
            result: {
              columns: ['_id', 'foo'],
              rows: hits,
            },
          })
        ),
      } as unknown as ExecutionContract);

      await expect(fetchEsql(fetchEsqlMockProps)).resolves.toEqual({
        records: [
          {
            id: `1@${responseTime}`,
            raw: hits[0],
            flattened: hits[0],
          },
          {
            id: `2@${responseTime}`,
            raw: hits[1],
            flattened: hits[1],
          },
        ],
        esqlQueryColumns: ['_id', 'foo'],
        esqlHeaderWarning: undefined,
        interceptedWarnings: [],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('should use inputTimeRange if provided', () => {
    const timeRange: TimeRange = { from: 'now-15m', to: 'now' };
    const result = getTextBasedQueryStateToAstProps({ ...fetchEsqlMockProps, timeRange });
    expect(result.time).toEqual(timeRange);
  });

  it('should use absolute time from data if inputTimeRange is not provided', () => {
    const absoluteTimeRange: TimeRange = {
      from: '2021-08-31T22:00:00.000Z',
      to: '2021-09-01T22:00:00.000Z',
    };
    jest
      .spyOn(discoverServiceMock.data.query.timefilter.timefilter, 'getAbsoluteTime')
      .mockReturnValue(absoluteTimeRange);

    const result = getTextBasedQueryStateToAstProps(fetchEsqlMockProps);

    expect(result.time).toEqual(absoluteTimeRange);
  });

  it('passes useApproximation to the expression searchContext', async () => {
    const expressionsExecuteSpy = jest.spyOn(discoverServiceMock.expressions, 'execute');
    expressionsExecuteSpy.mockReturnValueOnce({
      cancel: jest.fn(),
      getData: jest.fn(() => of({ result: { columns: [], rows: [] } })),
    } as unknown as ExecutionContract);

    await fetchEsql({ ...fetchEsqlMockProps, useApproximation: true });

    expect(expressionsExecuteSpy).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({
        searchContext: expect.objectContaining({ useApproximation: true }),
      })
    );
  });

  it('should add inline_highlights to the raw record when inline highlights are present', async () => {
    const hits = [
      { _index: 'i', _id: '1', snippets: '<em>bar</em>' },
      { _index: 'i', _id: '2', snippets: '<em>baz</em>' },
    ] as unknown as EsHitRecord[];
    const expressionsExecuteSpy = jest.spyOn(discoverServiceMock.expressions, 'execute');
    expressionsExecuteSpy.mockReturnValueOnce({
      cancel: jest.fn(),
      getData: jest.fn(() =>
        of({
          result: {
            columns: ['_id', 'snippets'],
            rows: hits,
          },
        })
      ),
    } as unknown as ExecutionContract);

    const result = await fetchEsql({
      ...fetchEsqlMockProps,
      query: { esql: 'from * | EVAL snippets = TOP_SNIPPETS(foo, "bar", { "highlight": true })' },
    });

    expect(result.records[0].raw.inline_highlights).toEqual({
      snippets: { preTag: '<em>', postTag: '</em>' },
    });
    expect(result.records[1].raw.inline_highlights).toEqual({
      snippets: { preTag: '<em>', postTag: '</em>' },
    });
  });
});
