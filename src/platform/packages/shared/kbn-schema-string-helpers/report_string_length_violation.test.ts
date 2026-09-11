/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metrics, ValueType } from '@opentelemetry/api';
import { reportStringLengthViolation } from './report_string_length_violation';

jest.mock('@opentelemetry/api', () => {
  const histogram = { record: jest.fn() };
  const meter = { createHistogram: jest.fn(() => histogram) };
  const provider = { getMeter: jest.fn(() => meter) };
  return {
    ...jest.requireActual('@opentelemetry/api'),
    metrics: { getMeterProvider: jest.fn(() => provider) },
  };
});

const provider = metrics.getMeterProvider();
const meter = provider.getMeter('test');
const histogram = meter.createHistogram('test');
jest.mocked(provider.getMeter).mockClear();
jest.mocked(meter.createHistogram).mockClear();

beforeEach(() => jest.mocked(histogram.record).mockReset());

test('creates one shared integer histogram with the proposed name', () => {
  reportStringLengthViolation({
    helper: 'savedObjectId',
    library: 'zod',
    maxLength: 512,
    length: 600,
  });
  reportStringLengthViolation({
    helper: 'savedObjectId',
    library: 'zod',
    maxLength: 512,
    length: 600,
  });
  expect(provider.getMeter).toHaveBeenCalledTimes(1);
  expect(provider.getMeter).toHaveBeenCalledWith('kibana.schema');
  expect(meter.createHistogram).toHaveBeenCalledTimes(1);
  expect(meter.createHistogram).toHaveBeenCalledWith(
    'kibana.schema.string_length_violation.length',
    {
      description: expect.any(String),
      unit: '{code_unit}',
      valueType: ValueType.INT,
      advice: { explicitBucketBoundaries: expect.any(Array) },
    }
  );
});

test('records the actual length with only static dimensions', () => {
  reportStringLengthViolation({
    helper: 'savedObjectId',
    library: 'zod',
    maxLength: 512,
    length: 600,
    label: 'dashboard.panelId',
  });
  expect(histogram.record).toHaveBeenCalledWith(600, {
    'schema.helper': 'savedObjectId',
    'schema.library': 'zod',
    'schema.max_length': 512,
    'schema.label': 'dashboard.panelId',
  });
});

test('omits an absent label', () => {
  reportStringLengthViolation({
    helper: 'description',
    library: 'config-schema',
    maxLength: 10000,
    length: 20000,
  });
  expect(histogram.record).toHaveBeenCalledWith(20000, {
    'schema.helper': 'description',
    'schema.library': 'config-schema',
    'schema.max_length': 10000,
  });
});

test('does not fail validation if the metric provider throws', () => {
  jest.mocked(histogram.record).mockImplementation(() => {
    throw new Error('Exporter failure');
  });
  expect(() =>
    reportStringLengthViolation({
      helper: 'savedObjectId',
      library: 'zod',
      maxLength: 512,
      length: 600,
    })
  ).not.toThrow();
});
