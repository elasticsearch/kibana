/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildRuntimeMappingsFromFieldTypes,
  buildSourceReadingRuntimeField,
} from './bulk_close_runtime_mappings';

describe('buildSourceReadingRuntimeField', () => {
  // Snapshot the script body so any change to it surfaces in review. The
  // bulk-close path attaches this script to `_update_by_query` and the
  // alerting framework's `missingFields` merge strategy is what makes it
  // resolve to a real value — both contracts depend on the exact shape.
  it('produces a stable script for a scalar runtime field type', () => {
    expect(buildSourceReadingRuntimeField('source.ip_ecs', 'ip')).toMatchSnapshot();
  });

  it('carries the field name through unchanged into script params', () => {
    const result = buildSourceReadingRuntimeField('some.nested.field', 'keyword');
    expect(result.script).toMatchObject({ params: { fieldName: 'some.nested.field' } });
    expect(result.type).toBe('keyword');
  });

  it('emits a different runtime field per requested type', () => {
    const asIp = buildSourceReadingRuntimeField('source.ip_ecs', 'ip');
    const asKeyword = buildSourceReadingRuntimeField('source.ip_ecs', 'keyword');
    expect(asIp.type).toBe('ip');
    expect(asKeyword.type).toBe('keyword');
    // Script body is identical modulo type — both read the same field from _source.
    expect(asIp.script).toEqual(asKeyword.script);
  });
});

describe('buildRuntimeMappingsFromFieldTypes', () => {
  it('returns undefined when the map is missing', () => {
    expect(buildRuntimeMappingsFromFieldTypes(undefined)).toBeUndefined();
  });

  it('returns undefined when the map is empty', () => {
    expect(buildRuntimeMappingsFromFieldTypes({})).toBeUndefined();
  });

  it('builds one source-reading runtime field per map entry', () => {
    const result = buildRuntimeMappingsFromFieldTypes({
      'source.ip_ecs': 'ip',
      'user.tag': 'keyword',
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(['source.ip_ecs', 'user.tag']);
    expect(result?.['source.ip_ecs']?.type).toBe('ip');
    expect(result?.['user.tag']?.type).toBe('keyword');
    // Each entry carries the source-reading script with its field name baked
    // into the script params (the runtime field reads from _source by name).
    expect(result?.['source.ip_ecs']?.script).toMatchObject({
      params: { fieldName: 'source.ip_ecs' },
    });
    expect(result?.['user.tag']?.script).toMatchObject({
      params: { fieldName: 'user.tag' },
    });
  });
});
