/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type {
  SavedObjectUnsanitizedDoc,
  SavedObjectSanitizedDoc,
  SavedObjectsModelVersionMap,
  SavedObjectModelUnsafeTransformFn,
} from '@kbn/core-saved-objects-server';

/**
 * @note Since all `uiSettings` migrations are added to the same migration function,
 * while not required, grouping settings by team, using a consistent naming prefix,
 * is good practice. For example: `ml:<setting-name>`.
 */

interface QuickRange {
  from: string;
  to: string;
  display: string;
}

/**
 * Presets appended to `timepicker:quickRanges` in model version 3.
 * Ordered chronologically (shortest span first within each family) so that the
 * block appended to a user's existing list reads naturally.
 *
 * Entries are deduped by `from|to`, so existing customizations (including custom
 * `display` labels) are preserved.
 *
 * Display strings are intentionally plain English: stored UI-setting values are
 * literal strings, never re-translated at read-time. The defaults registered in
 * the `data` plugin use `i18n.translate(...)`, which is resolved at server-startup
 * for the new value path only.
 */
export const TIMEPICKER_QUICK_RANGES_V3_PRESETS: ReadonlyArray<QuickRange> = [
  { from: 'now-1d/d', to: 'now-1d/d', display: 'Yesterday' },
  { from: 'now/w', to: 'now', display: 'This week until now' },
  { from: 'now/M', to: 'now/M', display: 'This month' },
  { from: 'now/M', to: 'now', display: 'This month until now' },
  { from: 'now/y', to: 'now/y', display: 'This year' },
  { from: 'now/y', to: 'now', display: 'This year until now' },
  { from: 'now-3h', to: 'now', display: 'Last 3 hours' },
  { from: 'now-12h', to: 'now', display: 'Last 12 hours' },
  { from: 'now-3d/d', to: 'now', display: 'Last 3 days' },
];

/**
 * Schema for `config` SO type attributes at model version 3.
 *
 * `config` stores `buildNum` plus an open-ended set of UI setting keys
 * (e.g. `timepicker:quickRanges`, `dateFormat`). `unknowns: 'allow'` lets the
 * dynamic setting keys flow through; `forwardCompatibility` uses `'ignore'` so
 * that any attributes a future model version may add are stripped when this
 * version reads such a document.
 */
const configAttributesSchemaV3 = schema.object(
  { buildNum: schema.maybe(schema.nullable(schema.number())) },
  { unknowns: 'allow' }
);

export const mergeTimepickerQuickRangesV3: SavedObjectModelUnsafeTransformFn<any, any> = (doc) => {
  const raw = doc.attributes?.['timepicker:quickRanges'];
  if (typeof raw !== 'string') return { document: doc };

  let existing: QuickRange[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { document: doc };
    existing = parsed;
  } catch {
    return { document: doc };
  }

  const seen = new Set(
    existing
      .filter((r) => r && typeof r.from === 'string' && typeof r.to === 'string')
      .map(({ from, to }) => `${from}|${to}`)
  );
  const additions = TIMEPICKER_QUICK_RANGES_V3_PRESETS.filter(
    ({ from, to }) => !seen.has(`${from}|${to}`)
  );

  if (additions.length === 0) return { document: doc };

  return {
    document: {
      ...doc,
      attributes: {
        ...doc.attributes,
        'timepicker:quickRanges': JSON.stringify([...existing, ...additions], null, 2),
      },
    },
  };
};

export const modelVersions: SavedObjectsModelVersionMap = {
  /**
   * First model version picks up from the last legacy migration in 8.9.0.
   */
  1: {
    changes: [],
  },
  2: {
    changes: [
      {
        type: 'data_removal',
        removedAttributePaths: ['visualization:useLegacyTimeAxis'],
      },
    ],
  },
  3: {
    changes: [
      {
        // owner: Team:DataDiscovery (timepicker:quickRanges)
        // Existing custom lists are merged with new presets so users do not lose options.
        //
        // `unsafe_transform` has no automatic reverse: on rollback to model
        // version 2, docs keep whatever this transform wrote. That is acceptable
        // for `timepicker:quickRanges` — extra entries stay valid for a v10.2
        // Kibana to read — but it means the `kbn-check-saved-objects-cli`
        // rollback test must be seeded with idempotent fixtures (docs that
        // either lack `timepicker:quickRanges` or already contain every V3
        // `from|to` combo). The unit tests in `migrations.test.ts` cover the
        // actual transform behaviour.
        type: 'unsafe_transform',
        transformFn: (guard) => guard(mergeTimepickerQuickRangesV3),
      },
    ],
    schemas: {
      forwardCompatibility: configAttributesSchemaV3.extends({}, { unknowns: 'ignore' }),
      create: configAttributesSchemaV3,
    },
  },
};

/**
 * Migrations using legacy upgrade mechanism, do not add to or remove from this map.
 * Future migrations should live in modelVersions map.
 */
export const migrations = {
  '7.9.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          key.startsWith('siem:')
            ? {
                ...acc,
                [key.replace('siem', 'securitySolution')]: doc.attributes[key],
              }
            : {
                ...acc,
                [key]: doc.attributes[key],
              },
        {}
      ),
    }),
    references: doc.references || [],
  }),
  '7.12.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce((acc, key) => {
        if (key === 'timepicker:quickRanges' && doc.attributes[key]?.indexOf('section') > -1) {
          const ranges = JSON.parse(doc.attributes[key]).map(
            ({ from, to, display }: { from: string; to: string; display: string }) => {
              return {
                from,
                to,
                display,
              };
            }
          );
          return {
            ...acc,
            'timepicker:quickRanges': JSON.stringify(ranges, null, 2),
          };
        } else {
          return {
            ...acc,
            [key]: doc.attributes[key],
          };
        }
      }, {}),
    }),
    references: doc.references || [],
  }),
  '7.13.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          key === 'ml:fileDataVisualizerMaxFileSize'
            ? {
                ...acc,
                ['fileUpload:maxFileSize']: doc.attributes[key],
              }
            : {
                ...acc,
                [key]: doc.attributes[key],
              },
        {}
      ),
    }),
    references: doc.references || [],
  }),
  '8.0.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          [
            // owner: Team:Geo
            'visualization:regionmap:showWarnings',
            'visualization:tileMap:WMSdefaults',
            'visualization:tileMap:maxPrecision',
            // owner: Team:Core
            'telemetry:optIn',
            'xPackMonitoring:allowReport',
            'theme:version',
            // owner: Team:AppServices
            'courier:batchSearches',
          ].includes(key)
            ? {
                ...acc,
              }
            : {
                ...acc,
                [key]: doc.attributes[key],
              },
        {}
      ),
    }),
    references: doc.references || [],
  }),
  '8.1.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce((acc, key) => {
        if (key === 'format:defaultTypeMap') {
          const initial = JSON.parse(doc.attributes[key]);
          const updated = {
            ...initial,
            geo_point: { id: 'geo_point', params: { transform: 'wkt' } },
          };
          return {
            ...acc,
            'format:defaultTypeMap': JSON.stringify(updated, null, 2),
          };
        } else if (key === 'securitySolution:rulesTableRefresh') {
          const initial = JSON.parse(doc.attributes[key]);
          const updated = {
            on: initial.on,
            value: initial.value,
          };
          return {
            ...acc,
            [key]: JSON.stringify(updated, null, 2),
          };
        } else {
          return {
            ...acc,
            [key]: doc.attributes[key],
          };
        }
      }, {}),
    }),
    references: doc.references || [],
  }),
  '8.5.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          [
            // owner: Team:Apm
            'observability:enableInfrastructureView',
          ].includes(key)
            ? {
                ...acc,
              }
            : {
                ...acc,
                [key]: doc.attributes[key],
              },
        {}
      ),
    }),
    references: doc.references || [],
  }),
  '8.7.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          [
            // owner: Team:Uptime
            'observability:enableNewSyntheticsView',
          ].includes(key)
            ? {
                ...acc,
              }
            : {
                ...acc,
                [key]: doc.attributes[key],
              },
        {}
      ),
    }),
    references: doc.references || [],
  }),
  '8.9.0': (doc: SavedObjectUnsanitizedDoc<any>): SavedObjectSanitizedDoc<any> => ({
    ...doc,
    ...(doc.attributes && {
      attributes: Object.keys(doc.attributes).reduce(
        (acc, key) =>
          [
            // owner: Team:Visualizations
            'visualize:enableLabs',
          ].includes(key)
            ? {
                ...acc,
              }
            : {
                ...acc,
                [key]: doc.attributes[key],
              },
        {}
      ),
    }),
    references: doc.references || [],
  }),
};
