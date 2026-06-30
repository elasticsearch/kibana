/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  SavedObjectModelTransformationContext,
  SavedObjectUnsanitizedDoc,
} from '@kbn/core-saved-objects-server';
import {
  migrations,
  mergeTimepickerQuickRangesV3,
  modelVersions,
  TIMEPICKER_QUICK_RANGES_V3_PRESETS,
} from './migrations';

const transformContext = {} as SavedObjectModelTransformationContext;

describe('ui_settings 7.9.0 migrations', () => {
  const migration = migrations['7.9.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });
  test('properly renames siem attributes to securitySolution', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'siem:defaultAnomalyScore': 59,
        'siem:enableNewsFeed': false,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'securitySolution:defaultAnomalyScore': 59,
        'securitySolution:enableNewsFeed': false,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
});

describe('ui_settings 7.12.0 migrations', () => {
  const migration = migrations['7.12.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });
  test('properly migrates timepicker:quickRanges', () => {
    const initialQuickRange: any = {
      from: '123',
      to: '321',
      display: 'abc',
      section: 2,
    };
    const { section, ...migratedQuickRange } = initialQuickRange;

    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'timepicker:quickRanges': JSON.stringify([initialQuickRange]),
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    const migrated = migration(doc);
    expect(JSON.parse(migrated.attributes['timepicker:quickRanges'])).toEqual([migratedQuickRange]);
  });

  // https://github.com/elastic/kibana/issues/95616
  test('returns doc when "timepicker:quickRanges" is null', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'timepicker:quickRanges': null,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    const migrated = migration(doc);
    expect(migrated).toEqual(doc);
  });
});

describe('ui_settings 7.13.0 migrations', () => {
  const migration = migrations['7.13.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });
  test('properly renames ml:fileDataVisualizerMaxFileSize to fileUpload:maxFileSize', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'ml:fileDataVisualizerMaxFileSize': '250MB',
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'fileUpload:maxFileSize': '250MB',
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
});

describe('ui_settings 8.0.0 migrations', () => {
  const migration = migrations['8.0.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });
  test('removes ui_settings from deleted region_map and tile_map plugins', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'visualization:regionmap:showWarnings': false,
        'visualization:tileMap:WMSdefaults': '{}',
        'visualization:tileMap:maxPrecision': 10,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
  test('removes telemetry:optIn and xPackMonitoring:allowReport from ui_settings', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'telemetry:optIn': false,
        'xPackMonitoring:allowReport': false,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
  test('removes custom theme:version setting', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'theme:version': 'v7',
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };

    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });

  test('removes "courier:batchSearches" setting', () => {
    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'courier:batchSearches': true,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };

    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
});

describe('ui_settings 8.1.0 migrations', () => {
  const migration = migrations['8.1.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });

  test('adds geo_point type to default map', () => {
    const initialDefaultTypeMap = {
      ip: { id: 'ip', params: {} },
      date: { id: 'date', params: {} },
      date_nanos: { id: 'date_nanos', params: {}, es: true },
      number: { id: 'number', params: {} },
      boolean: { id: 'boolean', params: {} },
      histogram: { id: 'histogram', params: {} },
      _source: { id: '_source', params: {} },
      _default_: { id: 'string', params: {} },
    };

    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'format:defaultTypeMap': JSON.stringify(initialDefaultTypeMap),
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };
    const migrated = migration(doc);
    expect(migrated.attributes.buildNum).toBe(9007199254740991);
    expect(JSON.parse(migrated.attributes['format:defaultTypeMap'])).toEqual({
      ip: { id: 'ip', params: {} },
      date: { id: 'date', params: {} },
      date_nanos: { id: 'date_nanos', params: {}, es: true },
      number: { id: 'number', params: {} },
      boolean: { id: 'boolean', params: {} },
      histogram: { id: 'histogram', params: {} },
      _source: { id: '_source', params: {} },
      _default_: { id: 'string', params: {} },
      geo_point: { id: 'geo_point', params: { transform: 'wkt' } },
    });
  });

  test('removes idleTimeout option from rulesTableRefresh', () => {
    const initialRulesTableRefresh = {
      on: true,
      value: 60000,
      idleTimeout: 2700000,
    };

    const doc = {
      type: 'config',
      id: '8.0.0',
      attributes: {
        buildNum: 9007199254740991,
        'securitySolution:rulesTableRefresh': JSON.stringify(initialRulesTableRefresh),
      },
      references: [],
      updated_at: '2022-01-19T11:26:54.645Z',
      migrationVersion: {},
    };
    const migrated = migration(doc);
    expect(migrated.attributes.buildNum).toBe(9007199254740991);
    expect(JSON.parse(migrated.attributes['securitySolution:rulesTableRefresh'])).toEqual({
      on: true,
      value: 60000,
    });
  });
});

describe('ui_settings 8.5.0 migrations', () => {
  const migration = migrations['8.5.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });

  test('removes "observability:enableInfrastructureView" setting', () => {
    const doc = {
      type: 'config',
      id: '8.5.0',
      attributes: {
        buildNum: 9007199254740991,
        'observability:enableInfrastructureView': true,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };

    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.5.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
});

describe('ui_settings 8.7.0 migrations', () => {
  const migration = migrations['8.7.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });

  test('removes "observability:enableNewSyntheticsView" setting', () => {
    const doc = {
      type: 'config',
      id: '8.7.0',
      attributes: {
        buildNum: 9007199254740991,
        'observability:enableNewSyntheticsView': true,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };

    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.7.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
});

describe('ui_settings model version 3 — mergeTimepickerQuickRangesV3', () => {
  const makeDoc = (raw: unknown): SavedObjectUnsanitizedDoc<any> => ({
    type: 'config',
    id: '9.x.x',
    attributes: {
      buildNum: 9007199254740991,
      'timepicker:quickRanges': raw,
    },
    references: [],
  });

  test('is a no-op when attribute is missing', () => {
    const doc: SavedObjectUnsanitizedDoc<any> = {
      type: 'config',
      id: '9.x.x',
      attributes: { buildNum: 9007199254740991 },
      references: [],
    };
    expect(mergeTimepickerQuickRangesV3(doc, transformContext).document).toEqual(doc);
  });

  test('is a no-op when attribute is null', () => {
    const doc = makeDoc(null);
    expect(mergeTimepickerQuickRangesV3(doc, transformContext).document).toEqual(doc);
  });

  test('is a no-op when attribute is not valid JSON', () => {
    const doc = makeDoc('not json');
    expect(mergeTimepickerQuickRangesV3(doc, transformContext).document).toEqual(doc);
  });

  test('is a no-op when attribute parses to a non-array', () => {
    const doc = makeDoc(JSON.stringify({ from: 'now-1h', to: 'now', display: 'oops' }));
    expect(mergeTimepickerQuickRangesV3(doc, transformContext).document).toEqual(doc);
  });

  test('appends all new presets to an empty custom list', () => {
    const doc = makeDoc(JSON.stringify([]));
    const result = mergeTimepickerQuickRangesV3(doc, transformContext);
    const out = JSON.parse(result.document.attributes!['timepicker:quickRanges']);
    expect(out).toEqual([...TIMEPICKER_QUICK_RANGES_V3_PRESETS]);
  });

  test('appends new presets after the user’s existing entries, preserving order', () => {
    const userEntries = [
      { from: 'now-1h', to: 'now', display: 'Recent hour' },
      { from: 'now-1d', to: 'now', display: 'Past day' },
    ];
    const doc = makeDoc(JSON.stringify(userEntries));
    const result = mergeTimepickerQuickRangesV3(doc, transformContext);
    const out = JSON.parse(result.document.attributes!['timepicker:quickRanges']);
    expect(out).toEqual([...userEntries, ...TIMEPICKER_QUICK_RANGES_V3_PRESETS]);
  });

  test('dedupes by from|to (preserves the user’s custom display label)', () => {
    const userEntries = [
      { from: 'now-1h', to: 'now', display: 'Recent hour' },
      // Same from/to as the new "Last 3 hours" preset but with a user-chosen label.
      { from: 'now-3h', to: 'now', display: 'Hot 3h window' },
    ];
    const doc = makeDoc(JSON.stringify(userEntries));
    const result = mergeTimepickerQuickRangesV3(doc, transformContext);
    const out = JSON.parse(result.document.attributes!['timepicker:quickRanges']);

    // The user's custom label survives, the duplicate from V3 presets is dropped.
    expect(out).toContainEqual({ from: 'now-3h', to: 'now', display: 'Hot 3h window' });
    expect(out.filter((r: any) => r.from === 'now-3h' && r.to === 'now')).toHaveLength(1);

    // All other V3 presets are still added.
    const expectedAdded = TIMEPICKER_QUICK_RANGES_V3_PRESETS.filter(
      (p) => !(p.from === 'now-3h' && p.to === 'now')
    );
    expect(out).toEqual([...userEntries, ...expectedAdded]);
  });

  test('distinguishes between presets with same `from` but different `to` (e.g. "This year" vs "This year until now")', () => {
    const userEntries = [
      // Matches "This year" (now/y → now/y) — should be deduped against that one only.
      { from: 'now/y', to: 'now/y', display: 'Current year' },
    ];
    const doc = makeDoc(JSON.stringify(userEntries));
    const result = mergeTimepickerQuickRangesV3(doc, transformContext);
    const out = JSON.parse(result.document.attributes!['timepicker:quickRanges']);

    // User's "This year" label is preserved.
    expect(out).toContainEqual({ from: 'now/y', to: 'now/y', display: 'Current year' });
    // "This year until now" (now/y → now) is a different entry — still added.
    expect(out).toContainEqual({ from: 'now/y', to: 'now', display: 'This year until now' });
  });

  test('is a no-op when the user already has every new preset', () => {
    const userEntries = [...TIMEPICKER_QUICK_RANGES_V3_PRESETS];
    const doc = makeDoc(JSON.stringify(userEntries));
    const result = mergeTimepickerQuickRangesV3(doc, transformContext);
    expect(result.document).toEqual(doc);
  });

  test('produces pretty-printed JSON consistent with the default registration', () => {
    const doc = makeDoc(JSON.stringify([]));
    const result = mergeTimepickerQuickRangesV3(doc, transformContext);
    const raw = result.document.attributes!['timepicker:quickRanges'] as string;
    expect(raw).toBe(JSON.stringify(TIMEPICKER_QUICK_RANGES_V3_PRESETS, null, 2));
  });

  test('defines forwardCompatibility and create schemas (required by the SO check)', () => {
    const mv3 = modelVersions[3];
    expect(mv3).toBeDefined();
    expect(mv3?.schemas?.forwardCompatibility).toBeDefined();
    expect(mv3?.schemas?.create).toBeDefined();
  });
});

describe('ui_settings 8.9.0 migrations', () => {
  const migration = migrations['8.9.0'];

  test('returns doc on empty object', () => {
    expect(migration({} as SavedObjectUnsanitizedDoc)).toEqual({
      references: [],
    });
  });

  test('removes "visualize:enableLabs" setting', () => {
    const doc = {
      type: 'config',
      id: '8.9.0',
      attributes: {
        buildNum: 9007199254740991,
        'visualize:enableLabs': true,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    };

    expect(migration(doc)).toEqual({
      type: 'config',
      id: '8.9.0',
      attributes: {
        buildNum: 9007199254740991,
      },
      references: [],
      updated_at: '2020-06-09T20:18:20.349Z',
      migrationVersion: {},
    });
  });
});
