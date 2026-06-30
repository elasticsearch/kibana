/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import { getEsqlDocumentId, parseEsqlSourceDocuments } from './parse_esql_source_documents';

const response = (
  columns: Array<{ name: string; type: string }>,
  values: unknown[][]
): ESQLSearchResponse => ({ columns, values } as unknown as ESQLSearchResponse);

describe('parseEsqlSourceDocuments', () => {
  describe('concrete index (METADATA _id, _source present)', () => {
    it('uses the _id and _source columns directly', () => {
      const result = parseEsqlSourceDocuments(
        response(
          [
            { name: '_source', type: 'object' },
            { name: '_id', type: 'keyword' },
          ],
          [[{ host: { name: 'a' } }, 'doc-1']]
        )
      );

      expect(result).toEqual([{ id: 'doc-1', source: { host: { name: 'a' } } }]);
    });

    it('defaults a null _source to an empty object', () => {
      const result = parseEsqlSourceDocuments(
        response(
          [
            { name: '_source', type: 'object' },
            { name: '_id', type: 'keyword' },
          ],
          [[null, 'doc-1']]
        )
      );

      expect(result).toEqual([{ id: 'doc-1', source: {} }]);
    });

    it('drops rows whose _id is not a string', () => {
      const result = parseEsqlSourceDocuments(
        response(
          [
            { name: '_source', type: 'object' },
            { name: '_id', type: 'keyword' },
          ],
          [[{ a: 1 }, null]]
        )
      );

      expect(result).toEqual([]);
    });
  });

  describe('ES|QL view (metadata dropped)', () => {
    it('reconstructs source from projected columns with id undefined', () => {
      const result = parseEsqlSourceDocuments(
        response(
          [
            { name: '@timestamp', type: 'date' },
            { name: 'host.name', type: 'keyword' },
            { name: 'message', type: 'text' },
          ],
          [['2026-06-18T00:00:00Z', 'h1', 'hello']]
        )
      );

      expect(result).toEqual([
        {
          id: undefined,
          source: { '@timestamp': '2026-06-18T00:00:00Z', 'host.name': 'h1', message: 'hello' },
        },
      ]);
    });

    it('omits null column values from the reconstructed source', () => {
      const result = parseEsqlSourceDocuments(
        response(
          [
            { name: 'message', type: 'text' },
            { name: 'host.name', type: 'keyword' },
          ],
          [['hello', null]]
        )
      );

      expect(result).toEqual([{ id: undefined, source: { message: 'hello' } }]);
    });

    it('drops rows whose projected columns are all null', () => {
      const result = parseEsqlSourceDocuments(
        response(
          [
            { name: '@timestamp', type: 'date' },
            { name: 'message', type: 'text' },
          ],
          [[null, null]]
        )
      );

      expect(result).toEqual([]);
    });

    it('returns empty when only metadata columns (no data columns) are present', () => {
      const result = parseEsqlSourceDocuments(
        response([{ name: '_index', type: 'keyword' }], [['logs-a']])
      );

      expect(result).toEqual([]);
    });
  });
});

describe('getEsqlDocumentId', () => {
  it('uses the real id when present (concrete index)', () => {
    expect(getEsqlDocumentId({ id: 'doc-1', source: { a: 1 } })).toBe('doc-1');
  });

  it('hashes the source deterministically when id is missing (view)', () => {
    const source = { '@timestamp': 't1', message: 'hello' };
    const first = getEsqlDocumentId({ id: undefined, source });
    const second = getEsqlDocumentId({ id: undefined, source: { ...source } });

    expect(typeof first).toBe('string');
    expect(first).toHaveLength(40);
    expect(first).toBe(second);
  });

  it('hashes different sources to different ids', () => {
    expect(getEsqlDocumentId({ id: undefined, source: { a: 1 } })).not.toBe(
      getEsqlDocumentId({ id: undefined, source: { a: 2 } })
    );
  });
});
