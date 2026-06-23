/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLSourceResult } from '@kbn/esql-types';
import { SOURCES_TYPES } from '@kbn/esql-types';
import { getQuickFixesForMessage } from '.';
import { getQuickFixesByMessageCode } from './fixes_by_message_code';

const wiredStreamSource = (name: string) =>
  ({ name, hidden: false, type: SOURCES_TYPES.WIRED_STREAM } as ESQLSourceResult);

const indexSource = (name: string) =>
  ({ name, hidden: false, type: SOURCES_TYPES.INDEX } as ESQLSourceResult);

describe('getQuickFixesForMessage', () => {
  it('returns an empty list when no quick fix is registered for the message code', async () => {
    const result = await getQuickFixesForMessage({
      queryString: 'FROM logs | KEEP missingField',
      message: { code: 'notARegisteredCode' },
    });

    expect(result).toEqual([]);
  });

  describe('unknownColumn', () => {
    it('returns an empty list for unknownColumn when callbacks are omitted (display condition can not be checked)', async () => {
      const result = await getQuickFixesForMessage({
        queryString: 'FROM logs.otel.child | KEEP missingField',
        message: { code: 'unknownColumn' },
      });

      expect(result).toEqual([]);
    });

    it('returns an empty list for unknownColumn when the query has no wired stream source', async () => {
      const getSources = jest.fn(async () => [indexSource('logs')]);

      const result = await getQuickFixesForMessage({
        queryString: 'FROM logs | KEEP missingField',
        message: { code: 'unknownColumn' },
        callbacks: { getSources },
      });

      expect(result).toEqual([]);
    });

    it('returns an empty list for unknownColumn when getSources throws', async () => {
      const getSources = jest.fn(async () => {
        throw new Error('network');
      });

      const result = await getQuickFixesForMessage({
        queryString: 'FROM logs.otel.child | KEEP missingField',
        message: { code: 'unknownColumn' },
        callbacks: { getSources },
      });

      expect(result).toEqual([]);
    });

    it('returns a load-unmapped-fields quick fix for unknownColumn when a wired stream is in the query', async () => {
      const getSources = jest.fn(async () => [wiredStreamSource('logs.otel.child')]);

      const result = await getQuickFixesForMessage({
        queryString: 'FROM logs.otel.child | KEEP missingField',
        message: { code: 'unknownColumn' },
        callbacks: { getSources },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          title: 'Load unmapped fields',
          fixedText: `SET unmapped_fields = "LOAD";\nFROM logs.otel.child\n  | KEEP missingField`,
        })
      );
    });

    it('returns an empty list when fixQuery throws', async () => {
      const unknownColumnQuickFix = getQuickFixesByMessageCode({
        code: 'unknownColumn',
      })[0];
      if (!unknownColumnQuickFix) {
        throw new Error('unknownColumn quick fix not registered');
      }

      const { fixQuery } = unknownColumnQuickFix;
      unknownColumnQuickFix.fixQuery = () => {
        throw new Error('mutator failed');
      };

      const getSources = jest.fn(async () => [wiredStreamSource('logs.otel.child')]);

      try {
        const result = await getQuickFixesForMessage({
          queryString: 'FROM logs.otel.child | KEEP missingField',
          message: { code: 'unknownColumn' },
          callbacks: { getSources },
        });

        expect(result).toEqual([]);
      } finally {
        unknownColumnQuickFix.fixQuery = fixQuery;
      }
    });
  });

  describe('columnTypeConflict', () => {
    it('returns an empty list when diagnostic data is missing', async () => {
      const result = await getQuickFixesForMessage({
        queryString: 'FROM logs-* | WHERE message IS NOT NULL',
        message: { code: 'columnTypeConflict' },
      });

      expect(result).toEqual([]);
    });

    it('does not suggest conversions that are not backed by inline casts', async () => {
      const queryString = 'FROM logs-* | WHERE message IS NOT NULL';

      const result = await getQuickFixesForMessage({
        queryString,
        message: {
          code: 'columnTypeConflict',
          data: {
            columnName: 'message',
            types: ['text'],
          },
          location: {
            min: queryString.indexOf('message'),
            max: queryString.indexOf('message') + 'message'.length,
          },
        },
      });

      expect(result).toEqual([]);
    });

    it('inserts an EVAL conversion before the command with the conflicting column', async () => {
      const queryString = 'FROM logs-* | WHERE message IS NOT NULL';

      const result = await getQuickFixesForMessage({
        queryString,
        message: {
          code: 'columnTypeConflict',
          data: {
            columnName: 'message',
            types: ['text', 'keyword'],
          },
          location: {
            min: queryString.indexOf('message'),
            max: queryString.indexOf('message') + 'message'.length,
          },
        },
      });

      expect(result).toEqual([
        {
          title: 'Convert message to keyword',
          fixedText: `FROM logs-*
  | EVAL message = TO_STRING(message)
  | WHERE message IS NOT NULL`,
        },
      ]);
    });
  });
});
