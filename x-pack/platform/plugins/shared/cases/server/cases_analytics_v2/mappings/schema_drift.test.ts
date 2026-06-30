/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingProperty, MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { SavedObject } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import type { CasePersistedAttributes } from '../../common/types/case';
import { CasePersistedSeverity, CasePersistedStatus } from '../../common/types/case';
import { createCaseSavedObjectType } from '../../saved_object_types/cases/cases';
import { ALL_TEMPLATE_TYPE_SUFFIXES } from '../data_view/runtime_fields';
import { buildCaseDoc } from '../writer/case_doc_builder';
import { CASE_INDEX_MAPPING } from './case';

/**
 * Schema drift guards — three complementary layers.
 *
 * Layer 1 (buildCaseDoc output ⊆ CASE_INDEX_MAPPING). The `.cases`
 * index is mapped `dynamic: 'strict'` — any field a doc builder
 * emits that isn't in the mapping fails the write with
 * `mapper_parsing_exception`. The writer's `.catch` swallow makes
 * that failure silent (success response, no doc landed, only an
 * ERROR log). This layer round-trips a maximally-populated synthetic
 * case through `buildCaseDoc` and asserts every emitted dotted path
 * resolves in `CASE_INDEX_MAPPING`. Catches a field added to the
 * doc-builder without a matching mapping update.
 *
 * Layer 2 (SO mapping ⊆ CASE_INDEX_MAPPING via `cases.<path>`).
 * Every field in the cases SO mapping at
 * `server/saved_object_types/cases/cases.ts` has a corresponding
 * entry in `CASE_INDEX_MAPPING` under `cases.<path>` (or is
 * explicitly allowlisted as an intentional divergence). Catches a
 * field added to the SO mapping without a mirror in v2.
 *
 * Layer 3 (`Required<CasePersistedAttributes>` fixture). The
 * synthetic case's attribute object is typed as
 * `Record<keyof Required<CasePersistedAttributes>, unknown>` — a
 * mapped type that enumerates every key, including optional ones.
 * Missing a key is a TypeScript compile error, forcing a decision
 * about what (or whether) `buildCaseDoc` should emit for it.
 *
 * Excluded from Layer 1:
 *   - `cases.extended_fields.*`: lands via the dynamic_template,
 *     not static properties.
 *   - `cases.observables.*`: lands via the dynamic_template
 *     (denormalized per-typeKey keys are dynamic).
 */

// ----- Layer 3 fixture (`Required<CasePersistedAttributes>`-keyed) -----
//
// Keys are enumerated via a mapped type over `Required<...>`. If
// `CasePersistedAttributes` gains a new property — even an optional
// one — TypeScript fails this file at compile time, forcing a
// decision about whether `buildCaseDoc` should emit it (Layer 1
// verifies the round-trip).
//
// Values are typed as `unknown` because some attribute types use
// branded shapes (`ConnectorPersisted`, `ExternalServicePersisted`,
// etc.) that aren't worth importing here. The structural drift
// checks (Layers 1 + 2) and the doc-builder's own compile-time
// types catch shape problems elsewhere.
const buildFullAttributes = (): {
  [K in keyof Required<CasePersistedAttributes>]: unknown;
} => ({
  owner: 'securitySolution',
  title: 'A title',
  description: 'A description',
  tags: ['tag1'],
  category: 'malware',
  assignees: [{ uid: 'u-1' }],
  severity: CasePersistedSeverity.HIGH,
  status: CasePersistedStatus.CLOSED,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-02T00:00:00.000Z',
  closed_at: '2026-05-03T00:00:00.000Z',
  in_progress_at: '2026-05-01T01:00:00.000Z',
  created_by: { username: 'jane', full_name: 'J', email: 'j@e.com', profile_uid: 'p-1' },
  closed_by: { username: 'jane', full_name: 'J', email: 'j@e.com', profile_uid: 'p-1' },
  updated_by: { username: 'jane', full_name: 'J', email: 'j@e.com', profile_uid: 'p-1' },
  duration: 12345,
  total_alerts: 3,
  total_comments: 5,
  total_events: 1,
  total_observables: 2,
  time_to_acknowledge: 60000,
  time_to_investigate: 120000,
  time_to_resolve: 300000,
  incremental_id: 42,
  template: { id: 't-1', version: 1 },
  // Runtime connectors always carry an `id` (which connector
  // instance) and a polymorphic `fields` blob (e.g. jira's fields
  // are not key/value). The fixture matches that shape so any v2
  // mapping that forgets `connector.id` or assumes
  // `fields.{key,value}` fails Layer 1.
  connector: {
    id: 'connector-1',
    name: 'jira',
    type: '.jira',
    fields: { issueType: '10006', priority: 'High', parent: null },
  },
  external_service: {
    pushed_at: '2026-05-02T00:00:00.000Z',
    pushed_by: { username: 'jane', full_name: 'J', email: 'j@e.com', profile_uid: 'p-1' },
    connector_name: 'jira',
    external_id: 'JIRA-1',
    external_title: 'Title',
    external_url: 'http://jira',
  },
  settings: { syncAlerts: false },
  observables: [{ typeKey: 'url', value: 'http://x.com', description: '' }],
  customFields: [{ key: 'cf', type: 'text', value: 'x' }],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  extended_fields: { riskScore_as_long: '42' },
});

const fullCaseSO = (): SavedObject<CasePersistedAttributes> =>
  ({
    type: CASE_SAVED_OBJECT,
    id: 'case-1',
    namespaces: ['default'],
    references: [],
    attributes: buildFullAttributes() as CasePersistedAttributes,
  } as SavedObject<CasePersistedAttributes>);

// ----- Helpers -----

/** Produce dotted paths for every leaf field of a parsed doc. */
const flatten = (doc: unknown, prefix = ''): string[] => {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatten(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
};

/** Set of mapped dotted paths from the mapping tree. */
const collectMappedPaths = (mapping: MappingTypeMapping): Set<string> => {
  const out = new Set<string>();
  const walk = (node: Record<string, MappingProperty>, prefix: string): void => {
    for (const [k, prop] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      out.add(path);
      // `enabled: false` swallows everything underneath — record the parent
      // but stop walking. Same for `dynamic: true` subtrees, which match
      // children via the dynamic_template.
      const stopAtParent =
        (prop as { enabled?: boolean }).enabled === false ||
        (prop as { dynamic?: boolean | string }).dynamic === true;
      if (!stopAtParent) {
        const props = (prop as { properties?: Record<string, MappingProperty> }).properties;
        if (props) walk(props, path);
      }
    }
  };
  if (mapping.properties) walk(mapping.properties, '');
  return out;
};

/** True if `path` is exactly mapped, OR is a descendant of an `enabled:false` or `dynamic:true` object. */
const isCovered = (path: string, mappedPaths: Set<string>): boolean => {
  if (mappedPaths.has(path)) return true;
  let p = path;
  while (true) {
    const idx = p.lastIndexOf('.');
    if (idx < 0) break;
    p = p.slice(0, idx);
    if (mappedPaths.has(p)) return true;
  }
  return false;
};

// ----- Layer 1: doc-builder output ⊆ v2 mapping -----

describe('case mapping covers every doc-builder field', () => {
  it('every path emitted by buildCaseDoc resolves to a mapping property', () => {
    const doc = buildCaseDoc(fullCaseSO());
    const mapped = collectMappedPaths(CASE_INDEX_MAPPING);
    const missing = flatten(doc).filter((p) => !isCovered(p, mapped));
    expect(missing).toEqual([]);
  });
});

// ----- Layer 2: SO mapping ⊆ v2 mapping (via `cases.<path>` prefix rule) -----

/**
 * Fields present in the cases SO mapping that intentionally don't
 * appear at the parallel `cases.<path>` location in v2 *and* aren't
 * covered by an `enabled: false` / `dynamic: true` ancestor (which
 * `isCovered` handles via prefix-match).
 *
 * Document the rationale next to each entry. An unexplained
 * allowlist entry is "engineer silently skips a new SO field" —
 * exactly what this layer exists to prevent.
 */
const OMITTED_FROM_ANALYTICS_V2_MIRROR: ReadonlyMap<string, string> = new Map([
  // Empty. (`owner` is mirrored at `cases.owner` in addition to its
  // top-level DLS copy, so it satisfies the Layer 2 mirror directly.)
  // The intentional divergences are all covered by an opaque
  // (`enabled: false`) or `dynamic: true` parent in v2 and caught by
  // the `isCovered` rule:
  //  - cases.settings.{syncAlerts,extractObservables}
  //    → v2 cases.settings is `enabled: false` (per-case config,
  //      not an analytics dimension).
  //  - cases.observables.{typeKey,value,description}
  //    → v2 cases.observables is `dynamic: true` (denormalized to
  //      `cases.observables.<typeKey>` via dynamic_template;
  //      description dropped).
]);

describe('cases SO mapping is mirrored in CASE_INDEX_MAPPING', () => {
  const soMapping = createCaseSavedObjectType(
    coreMock.createSetup(),
    loggerMock.create(),
    {} as never // Do not need the config definition here
  ).mappings as MappingTypeMapping;
  const soPaths = collectMappedPaths(soMapping);
  const v2Paths = collectMappedPaths(CASE_INDEX_MAPPING);

  it('every SO mapping field exists at cases.<path> in v2 (or is covered / allowlisted)', () => {
    // Mechanical rule: SO field `foo.bar` is expected at `cases.foo.bar` in
    // v2. `isCovered` also accepts a match on any prefix — so SO subfields
    // of an opaque (`enabled: false`) or `dynamic: true` v2 parent are
    // implicitly covered without needing an allowlist entry. Anything that
    // still doesn't match must appear in `OMITTED_FROM_ANALYTICS_V2_MIRROR`
    // with a documented reason.
    const missing = [...soPaths].filter((soPath) => {
      if (OMITTED_FROM_ANALYTICS_V2_MIRROR.has(soPath)) return false;
      const expected = `cases.${soPath}`;
      return !isCovered(expected, v2Paths);
    });
    expect(missing).toEqual([]);
  });
});

// ----- Snake-key collision guard (runtime field naming invariant) -----

/**
 * Typed runtime fields are published at `cases.<snakeKey>` (e.g.
 * `cases.score_as_long`) — direct children of `cases`. The strict
 * collision is at the exact full path `cases.<snake>`. The check
 * scans the leaf segment everywhere as broader defense against
 * naming-confusion foot-guns and future widening of the runtime
 * publication scheme.
 *
 * The suffix set is exported from `data_view/runtime_fields.ts` as
 * `ALL_TEMPLATE_TYPE_SUFFIXES`, so adding a new template type
 * extends this test automatically.
 */
const leafEndsInTypeSuffix = (path: string): boolean => {
  const leaf = path.slice(path.lastIndexOf('.') + 1);
  return ALL_TEMPLATE_TYPE_SUFFIXES.some((suffix) => leaf.endsWith(`_as_${suffix}`));
};

describe('snake-key collision guard (runtime field naming invariant)', () => {
  it('no field in the case mapping ends in _as_<type>', () => {
    const collisions = [...collectMappedPaths(CASE_INDEX_MAPPING)].filter(leafEndsInTypeSuffix);
    expect(collisions).toEqual([]);
  });
});
