/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import { validateEsqlQueryForStreamOrThrow, EsqlQueryValidationError } from './validate_esql_query';

jest.mock('@elastic/esql', () => {
  const actual = jest.requireActual('@elastic/esql');
  return {
    ...actual,
    Parser: {
      ...actual.Parser,
      parse: jest.fn(actual.Parser.parse),
    },
  };
});

const createWiredStreamDefinition = (name: string): Streams.WiredStream.Definition => ({
  name,
  description: '',
  updated_at: new Date().toISOString(),
  type: 'wired',
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [], updated_at: new Date().toISOString() },
    settings: {},
    failure_store: { inherit: {} },
    wired: {
      fields: {},
      routing: [],
    },
  },
});

const createQueryStreamDefinition = (
  name: string,
  view: string
): Streams.QueryStream.Definition => ({
  name,
  description: '',
  type: 'query',
  updated_at: new Date().toISOString(),
  query: {
    view,
    esql: `FROM ${view}`,
  },
});

const createClassicStreamDefinition = (name: string): Streams.ClassicStream.Definition => ({
  name,
  description: '',
  type: 'classic',
  updated_at: new Date().toISOString(),
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [], updated_at: new Date().toISOString() },
    settings: {},
    failure_store: { inherit: {} },
    classic: {
      field_overrides: {},
    },
  },
});

describe('validateEsqlQueryForStreamOrThrow', () => {
  describe('parsing errors', () => {
    it('should throw for syntactically invalid ES|QL', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({ esqlQuery: '{{INVALID ESQL}}', stream })
      ).toThrow(EsqlQueryValidationError);
    });

    it('should include "Invalid ES|QL query" in the error message for unparseable input', () => {
      const { Parser } = jest.requireMock('@elastic/esql');
      (Parser.parse as jest.Mock).mockImplementationOnce(() => {
        throw new Error('parse failure');
      });

      const stream = createWiredStreamDefinition('logs');

      expect(() => validateEsqlQueryForStreamOrThrow({ esqlQuery: 'anything', stream })).toThrow(
        'Invalid ES|QL query: parse failure'
      );
    });

    it('should set statusCode to 400', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({ esqlQuery: '{{INVALID ESQL}}', stream })
      ).toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('FROM clause validation', () => {
    it('should throw when FROM clause is missing', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() => validateEsqlQueryForStreamOrThrow({ esqlQuery: 'SHOW INFO', stream })).toThrow(
        'ES|QL query must contain a FROM clause'
      );
    });

    it('should throw when FROM clause has no sources', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({ esqlQuery: 'FROM | LIMIT 10', stream })
      ).toThrow(EsqlQueryValidationError);
    });
  });

  describe('source validation for wired streams', () => {
    it('should accept FROM name, name.*', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs, logs.* METADATA _id, _source',
          stream,
        })
      ).not.toThrow();
    });

    it('should reject FROM name.*, name (reversed order)', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs.*, logs METADATA _id, _source',
          stream,
        })
      ).toThrow('ES|QL query must use FROM logs, logs.*');
    });

    it('should reject FROM with only the stream name', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs METADATA _id, _source',
          stream,
        })
      ).toThrow('ES|QL query must use FROM logs, logs.*');
    });

    it('should reject FROM with only the wildcard pattern', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs.* METADATA _id, _source',
          stream,
        })
      ).toThrow('ES|QL query must use FROM logs, logs.*');
    });

    it('should reject FROM with an unrelated source', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM metrics, metrics.* METADATA _id, _source',
          stream,
        })
      ).toThrow('ES|QL query must use FROM logs, logs.*');
    });
  });

  describe('source validation for classic streams', () => {
    it('should accept FROM with only the stream name', () => {
      const stream = createClassicStreamDefinition('metrics-custom');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM metrics-custom METADATA _id, _source',
          stream,
        })
      ).not.toThrow();
    });

    it('should accept FROM name, name.*', () => {
      const stream = createClassicStreamDefinition('metrics-custom');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM metrics-custom, metrics-custom.* METADATA _id, _source',
          stream,
        })
      ).not.toThrow();
    });

    it('should reject FROM with only the wildcard pattern', () => {
      const stream = createClassicStreamDefinition('metrics-custom');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM metrics-custom.* METADATA _id, _source',
          stream,
        })
      ).toThrow(
        'ES|QL query must use FROM metrics-custom or FROM metrics-custom, metrics-custom.*'
      );
    });

    it('should reject FROM with an unrelated source', () => {
      const stream = createClassicStreamDefinition('metrics-custom');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs METADATA _id, _source',
          stream,
        })
      ).toThrow(
        'ES|QL query must use FROM metrics-custom or FROM metrics-custom, metrics-custom.*'
      );
    });
  });

  describe('source validation for query streams', () => {
    it('should accept FROM <view> (the stream view name)', () => {
      const stream = createQueryStreamDefinition('query', '$.query');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM $.query METADATA _id, _source',
          stream,
        })
      ).not.toThrow();
    });

    it('should accept the quoted view name', () => {
      const stream = createQueryStreamDefinition('query', '$.query');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM "$.query" METADATA _id, _source',
          stream,
        })
      ).not.toThrow();
    });

    it('should reject FROM with the stream name instead of the view', () => {
      const stream = createQueryStreamDefinition('query', '$.query');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM query, query.* METADATA _id, _source',
          stream,
        })
      ).toThrow('ES|QL query must use FROM $.query');
    });

    it('should reject FROM with an unrelated view', () => {
      const stream = createQueryStreamDefinition('query', '$.query');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM $.other METADATA _id, _source',
          stream,
        })
      ).toThrow('ES|QL query must use FROM $.query');
    });
  });

  describe('METADATA validation', () => {
    it('should throw when METADATA is missing entirely', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs, logs.*',
          stream,
        })
      ).toThrow('ES|QL query METADATA must include both `_id` and `_source`');
    });

    it('should throw when _id is missing from METADATA', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs, logs.* METADATA _source',
          stream,
        })
      ).toThrow('ES|QL query METADATA must include both `_id` and `_source`');
    });

    it('should throw when _source is missing from METADATA', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs, logs.* METADATA _id',
          stream,
        })
      ).toThrow('ES|QL query METADATA must include both `_id` and `_source`');
    });

    it('should accept METADATA with both _id and _source', () => {
      const stream = createWiredStreamDefinition('logs');

      expect(() =>
        validateEsqlQueryForStreamOrThrow({
          esqlQuery: 'FROM logs, logs.* METADATA _id, _source',
          stream,
        })
      ).not.toThrow();
    });
  });
});
