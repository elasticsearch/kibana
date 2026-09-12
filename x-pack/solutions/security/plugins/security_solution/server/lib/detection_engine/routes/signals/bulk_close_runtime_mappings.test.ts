/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import {
  buildRuntimeMappingsFromFieldTypes,
  buildSourceReadingRuntimeField,
  mergeBulkCloseRuntimeMappings,
} from './bulk_close_runtime_mappings';

/** Narrow the runtime field value for test assertions. */
const asField = (v: unknown) => v as estypes.MappingRuntimeField & { format?: string };

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

describe('mergeBulkCloseRuntimeMappings', () => {
  it('returns undefined when both inputs are absent', () => {
    expect(mergeBulkCloseRuntimeMappings(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined when both inputs are empty', () => {
    expect(mergeBulkCloseRuntimeMappings({}, {})).toBeUndefined();
  });

  it('returns synthesised mappings when passthrough is absent', () => {
    const synthesized = buildRuntimeMappingsFromFieldTypes({ 'source.ip_ecs': 'ip' });
    const result = mergeBulkCloseRuntimeMappings(synthesized, undefined);
    expect(result?.['source.ip_ecs']?.type).toBe('ip');
    // synthesised field uses the _source-reading script
    expect(result?.['source.ip_ecs']?.script).toMatchObject({
      params: { fieldName: 'source.ip_ecs' },
    });
  });

  it('passthrough entries are forwarded verbatim with on_script_error stamped', () => {
    const result = mergeBulkCloseRuntimeMappings(undefined, {
      display_name: {
        type: 'keyword',
        script: { source: "emit(doc['first'].value + ' ' + doc['last'].value)" },
      },
    });
    expect(result?.display_name?.type).toBe('keyword');
    // The caller's script must survive the merge — this is the core of the fix.
    const scriptedField = asField(result?.display_name);
    const inlineScript = scriptedField?.script as { source?: string } | undefined;
    expect(inlineScript?.source).toContain("doc['first'].value + ' ' + doc['last'].value");
    expect(scriptedField?.on_script_error).toBe('continue');
  });

  it('passthrough entry without a script is forwarded with type only and no on_script_error', () => {
    // on_script_error is only set when a script is present — omitting it for scriptless entries
    // avoids sending a property that has no meaning (and may cause ES validation errors in
    // future ES versions that enforce the constraint).
    const result = mergeBulkCloseRuntimeMappings(undefined, {
      process_risk_label: { type: 'keyword' },
    });
    const scriptlessField = asField(result?.process_risk_label);
    expect(scriptlessField?.type).toBe('keyword');
    expect(scriptlessField?.script).toBeUndefined();
    expect(scriptlessField?.on_script_error).toBeUndefined();
  });

  it('passthrough wins on key collision with synthesised entry', () => {
    // Same field name in both inputs — passthrough carries a real script,
    // synthesised would use the generic _source reader.
    const synthesized = buildRuntimeMappingsFromFieldTypes({ display_name: 'keyword' });
    const passthrough = {
      display_name: {
        type: 'keyword' as const,
        script: { source: "emit(doc['first'].value)" },
      },
    };
    const result = mergeBulkCloseRuntimeMappings(synthesized, passthrough);
    // Must use the passthrough script, not the synthesised _source reader.
    const collisionField = asField(result?.display_name);
    const collisionScript = collisionField?.script as
      | { source?: string; params?: unknown }
      | undefined;
    expect(collisionScript?.source).toBe("emit(doc['first'].value)");
    expect(collisionScript?.params).toBeUndefined();
  });

  it('preserves synthesised entries not in the passthrough', () => {
    const synthesized = buildRuntimeMappingsFromFieldTypes({ 'source.ip_ecs': 'ip' });
    const passthrough = {
      display_name: {
        type: 'keyword' as const,
        script: { source: "emit(doc['first'].value)" },
      },
    };
    const result = mergeBulkCloseRuntimeMappings(synthesized, passthrough);
    expect(Object.keys(result ?? {}).sort()).toEqual(['display_name', 'source.ip_ecs']);
    // synthesised entry untouched
    expect(result?.['source.ip_ecs']?.type).toBe('ip');
    expect(result?.['source.ip_ecs']?.script).toMatchObject({
      params: { fieldName: 'source.ip_ecs' },
    });
  });

  it('stamps on_script_error: continue on scripted entries and omits it on scriptless entries', () => {
    // on_script_error is set only when a script is present — callers cannot supply it
    // (route schema rejects it), and it should not appear on scriptless entries.
    const result = mergeBulkCloseRuntimeMappings(undefined, {
      scripted_field: {
        type: 'keyword',
        script: { source: "emit(doc['x'].value)" },
      },
      scriptless_field: { type: 'keyword' },
    });
    expect(asField(result?.scripted_field)?.on_script_error).toBe('continue');
    expect(asField(result?.scriptless_field)?.on_script_error).toBeUndefined();
  });

  it('carries format through from passthrough', () => {
    const result = mergeBulkCloseRuntimeMappings(undefined, {
      event_date: { type: 'date', format: 'strict_date_optional_time' },
    });
    expect(asField(result?.event_date)?.format).toBe('strict_date_optional_time');
  });
});
