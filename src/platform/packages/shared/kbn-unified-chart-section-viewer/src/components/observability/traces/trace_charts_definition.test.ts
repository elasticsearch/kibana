/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getErrorRateChart, getLatencyChart, getThroughputChart } from './trace_charts_definition';
import { chartPalette } from '.';

describe('trace_charts_definition', () => {
  const mockIndexes = 'traces-*';
  const mockFilters = ['service.name == "test-service"', 'environment == "production"'];
  const mockInvalidFilters = ['service.name:test-service'];
  const unmappedFieldsPrefix = 'SET unmapped_fields="NULLIFY";';

  describe('getErrorRateChart', () => {
    it('should return error rate chart configuration', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result).toEqual({
        id: 'error_rate',
        title: 'Error Rate',
        color: chartPalette[6],
        unit: 'percent',
        seriesType: 'line',
        esqlQuery: expect.stringContaining('FROM traces-*'),
      });

      expect(result?.esqlQuery).toContain(unmappedFieldsPrefix);
      expect(result?.esqlQuery).toContain(
        'WHERE TO_STRING(processor.event) == "transaction" OR TO_STRING(processor.event) == "span" OR processor.event IS NULL'
      );
      expect(result?.esqlQuery).toContain('TO_STRING(event.outcome) == "failure"');
      expect(result?.esqlQuery).toContain('TO_STRING(status.code) == "Error"');
    });

    it('should include all provided filters in the ESQL query', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toContain('service.name == "test-service"');
      expect(result?.esqlQuery).toContain('environment == "production"');
      expect(result?.esqlQuery).toContain('TO_STRING(processor.event) == "transaction"');
    });

    it('should handle empty filters array', () => {
      const result = getErrorRateChart({ indexes: mockIndexes, filters: [], metadataFields: [] });

      expect(result?.esqlQuery).toContain('TO_STRING(processor.event) == "transaction"');
      expect(result?.esqlQuery).toContain('FROM traces-*');
    });

    it('should generate valid ESQL query structure', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toMatch(/FROM .+/);
      expect(result?.esqlQuery).toContain('STATS');
      expect(result?.esqlQuery).toContain('EVAL');
      expect(result?.esqlQuery).toContain('KEEP');
      expect(result?.esqlQuery).toContain('SORT');
      expect(result?.esqlQuery).toContain('TBUCKET(100)');
    });

    it('should include METADATA directive', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: ['_id == "abc" AND _index == "traces-0001"'],
        metadataFields: ['_id', '_index'],
      });

      expect(result?.esqlQuery).toContain('FROM traces-* METADATA _id, _index');
    });

    it('should produce the expected full ESQL query', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toMatchInlineSnapshot(
        `"SET unmapped_fields=\\"NULLIFY\\"; FROM traces-* | WHERE service.name == \\"test-service\\" | WHERE environment == \\"production\\" | WHERE TO_STRING(processor.event) == \\"transaction\\" OR TO_STRING(processor.event) == \\"span\\" OR processor.event IS NULL | STATS failure = COUNT(*) WHERE TO_STRING(event.outcome) == \\"failure\\" OR TO_STRING(status.code) == \\"Error\\", all = COUNT(*) BY timestamp = TBUCKET(100) | EVAL error_rate = TO_DOUBLE(failure) / all | KEEP timestamp, error_rate | SORT timestamp"`
      );
    });
  });

  describe('getLatencyChart', () => {
    it('should return latency chart configuration', () => {
      const result = getLatencyChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result).toEqual({
        id: 'latency',
        title: 'Latency',
        color: chartPalette[2],
        unit: 'ms',
        seriesType: 'line',
        esqlQuery: expect.stringContaining('FROM traces-*'),
      });

      expect(result?.esqlQuery).toContain(unmappedFieldsPrefix);
      expect(result?.esqlQuery).toContain(
        'WHERE TO_STRING(processor.event) == "transaction" OR TO_STRING(processor.event) == "span" OR processor.event IS NULL'
      );
      expect(result?.esqlQuery).toContain(
        'duration_ms_ecs = CASE(transaction.duration.us IS NOT NULL, TO_DOUBLE(transaction.duration.us) / 1000, span.duration.us IS NOT NULL, TO_DOUBLE(span.duration.us) / 1000, NULL)'
      );
      expect(result?.esqlQuery).toContain('duration_ms_otel = ROUND(duration) / 1000 / 1000');
      expect(result?.esqlQuery).toContain(
        'duration_ms = COALESCE(TO_LONG(duration_ms_ecs), TO_LONG(duration_ms_otel))'
      );
    });

    it('should include all provided filters in the ESQL query', () => {
      const result = getLatencyChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toContain('service.name == "test-service"');
      expect(result?.esqlQuery).toContain('environment == "production"');
      expect(result?.esqlQuery).toContain('TO_STRING(processor.event) == "transaction"');
    });

    it('should handle empty filters array', () => {
      const result = getLatencyChart({ indexes: mockIndexes, filters: [], metadataFields: [] });

      expect(result?.esqlQuery).toContain('FROM traces-*');
    });

    it('should generate valid ESQL query structure', () => {
      const result = getLatencyChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      // Verify basic ESQL structure
      expect(result?.esqlQuery).toMatch(/FROM .+/);
      expect(result?.esqlQuery).toContain('EVAL');
      expect(result?.esqlQuery).toContain('STATS');
      expect(result?.esqlQuery).toContain('AVG(duration_ms)');
      expect(result?.esqlQuery).toContain('TBUCKET(100)');
    });

    it('should produce the expected full ESQL query', () => {
      const result = getLatencyChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toMatchInlineSnapshot(
        `"SET unmapped_fields=\\"NULLIFY\\"; FROM traces-* | WHERE service.name == \\"test-service\\" | WHERE environment == \\"production\\" | WHERE TO_STRING(processor.event) == \\"transaction\\" OR TO_STRING(processor.event) == \\"span\\" OR processor.event IS NULL | EVAL duration_ms_ecs = CASE(transaction.duration.us IS NOT NULL, TO_DOUBLE(transaction.duration.us) / 1000, span.duration.us IS NOT NULL, TO_DOUBLE(span.duration.us) / 1000, NULL) | EVAL duration_ms_otel = ROUND(duration) / 1000 / 1000 | EVAL duration_ms = COALESCE(TO_LONG(duration_ms_ecs), TO_LONG(duration_ms_otel)) | STATS AVG(duration_ms) BY TBUCKET(100)"`
      );
    });
  });

  describe('getThroughputChart', () => {
    it('should return throughput chart configuration', () => {
      const result = getThroughputChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result).toEqual({
        id: 'throughput',
        title: 'Throughput',
        color: chartPalette[0],
        unit: 'count',
        seriesType: 'line',
        esqlQuery: expect.stringContaining('FROM traces-*'),
      });

      expect(result?.esqlQuery).toContain(unmappedFieldsPrefix);
      expect(result?.esqlQuery).toContain(
        'WHERE TO_STRING(processor.event) == "transaction" OR TO_STRING(processor.event) == "span" OR processor.event IS NULL'
      );
      expect(result?.esqlQuery).toContain('id = COALESCE(transaction.id, span.id)');
      expect(result?.esqlQuery).toContain('COUNT(id)');
      expect(result?.esqlQuery).toContain('TO_STRING(processor.event) == "transaction"');
    });

    it('should include all provided filters in the ESQL query', () => {
      const result = getThroughputChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toContain('service.name == "test-service"');
      expect(result?.esqlQuery).toContain('environment == "production"');
      expect(result?.esqlQuery).toContain('TO_STRING(processor.event) == "transaction"');
    });

    it('should handle empty filters array', () => {
      const result = getThroughputChart({ indexes: mockIndexes, filters: [], metadataFields: [] });

      expect(result?.esqlQuery).toContain('FROM traces-*');
    });

    it('should generate valid ESQL query structure', () => {
      const result = getThroughputChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      // Verify basic ESQL structure
      expect(result?.esqlQuery).toMatch(/FROM .+/);
      expect(result?.esqlQuery).toContain('STATS');
    });

    it('should produce the expected full ESQL query', () => {
      const result = getThroughputChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
      });

      expect(result?.esqlQuery).toMatchInlineSnapshot(
        `"SET unmapped_fields=\\"NULLIFY\\"; FROM traces-* | WHERE service.name == \\"test-service\\" | WHERE environment == \\"production\\" | WHERE TO_STRING(processor.event) == \\"transaction\\" OR TO_STRING(processor.event) == \\"span\\" OR processor.event IS NULL | EVAL id = COALESCE(transaction.id, span.id) | STATS COUNT(id) BY TBUCKET(100)"`
      );
    });
  });

  describe('when breakdownField is provided', () => {
    const breakdownField = 'service.name';

    it('getLatencyChart appends the field to the BY clause', () => {
      const result = getLatencyChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
        breakdownField,
      });

      expect(result?.esqlQuery).toContain(`, ${breakdownField}`);
      expect(result?.esqlQuery).toMatchInlineSnapshot(
        `"SET unmapped_fields=\\"NULLIFY\\"; FROM traces-* | WHERE service.name == \\"test-service\\" | WHERE environment == \\"production\\" | WHERE TO_STRING(processor.event) == \\"transaction\\" OR TO_STRING(processor.event) == \\"span\\" OR processor.event IS NULL | EVAL duration_ms_ecs = CASE(transaction.duration.us IS NOT NULL, TO_DOUBLE(transaction.duration.us) / 1000, span.duration.us IS NOT NULL, TO_DOUBLE(span.duration.us) / 1000, NULL) | EVAL duration_ms_otel = ROUND(duration) / 1000 / 1000 | EVAL duration_ms = COALESCE(TO_LONG(duration_ms_ecs), TO_LONG(duration_ms_otel)) | STATS AVG(duration_ms) BY TBUCKET(100), service.name"`
      );
    });

    it('getErrorRateChart appends the field to the BY and KEEP clauses', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
        breakdownField,
      });

      expect(result?.esqlQuery).toContain(`, ${breakdownField}`);
      expect(result?.esqlQuery).toMatchInlineSnapshot(
        `"SET unmapped_fields=\\"NULLIFY\\"; FROM traces-* | WHERE service.name == \\"test-service\\" | WHERE environment == \\"production\\" | WHERE TO_STRING(processor.event) == \\"transaction\\" OR TO_STRING(processor.event) == \\"span\\" OR processor.event IS NULL | STATS failure = COUNT(*) WHERE TO_STRING(event.outcome) == \\"failure\\" OR TO_STRING(status.code) == \\"Error\\", all = COUNT(*) BY timestamp = TBUCKET(100), service.name | EVAL error_rate = TO_DOUBLE(failure) / all | KEEP timestamp, error_rate, service.name | SORT timestamp"`
      );
    });

    it('getThroughputChart appends the field to the BY clause', () => {
      const result = getThroughputChart({
        indexes: mockIndexes,
        filters: mockFilters,
        metadataFields: [],
        breakdownField,
      });

      expect(result?.esqlQuery).toContain(`, ${breakdownField}`);
      expect(result?.esqlQuery).toMatchInlineSnapshot(
        `"SET unmapped_fields=\\"NULLIFY\\"; FROM traces-* | WHERE service.name == \\"test-service\\" | WHERE environment == \\"production\\" | WHERE TO_STRING(processor.event) == \\"transaction\\" OR TO_STRING(processor.event) == \\"span\\" OR processor.event IS NULL | EVAL id = COALESCE(transaction.id, span.id) | STATS COUNT(id) BY TBUCKET(100), service.name"`
      );
    });
  });

  describe('when invalid filters are provided', () => {
    it('getErrorRateChart should return null', () => {
      const result = getErrorRateChart({
        indexes: mockIndexes,
        filters: mockInvalidFilters,
        metadataFields: [],
      });

      expect(result).toBeNull();
    });

    it('getLatencyChart should return null', () => {
      const result = getLatencyChart({
        indexes: mockIndexes,
        filters: mockInvalidFilters,
        metadataFields: [],
      });

      expect(result).toBeNull();
    });

    it('getThroughputChart should return null', () => {
      const result = getThroughputChart({
        indexes: mockIndexes,
        filters: mockInvalidFilters,
        metadataFields: [],
      });

      expect(result).toBeNull();
    });
  });
});
