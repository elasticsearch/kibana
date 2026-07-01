/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import { ACTIVITY_INDEX_NAME, CASE_INDEX_NAME } from '../constants';

/**
 * Index pattern fed to the data view's `title`. The data views API treats
 * each comma-separated token as an index pattern, so a single managed view
 * spans both `.cases` and `.cases-activity` (and any future analytics
 * index added to this list). Cross-index queries via ES|QL `LOOKUP JOIN`
 * work against the same view.
 *
 * Cases is listed first as the dimension table that the activity surface
 * joins back to. The data view itself doesn't care about order.
 */
export const CASE_ANALYTICS_DATA_VIEW_TITLE = `${CASE_INDEX_NAME},${ACTIVITY_INDEX_NAME}`;

/**
 * Shared prefix for every managed Cases data view id. One data view per
 * space; the id is suffixed with the space id so they're independently
 * addressable. Exported so `/reset` can enumerate per-space views via a
 * prefix match.
 */
export const CASE_DATA_VIEW_ID_PREFIX = 'cases-analytics-managed-';

/**
 * Deterministic data view id for the given space. Same id across every
 * Kibana node and every restart for the same space, so concurrent
 * bootstrap calls converge on the same saved object instead of creating
 * duplicates.
 */
export const getCaseDataViewId = (spaceId: string): string =>
  `${CASE_DATA_VIEW_ID_PREFIX}${spaceId}`;

/**
 * Display name shown in the Lens / Discover data view dropdown. The cases
 * plugin also surfaces user-facing case lists and pages, so calling this
 * view "Cases" would collide with those. "Case Analytics" makes it clear
 * which surface an administrator is looking at.
 */
const CASE_DATA_VIEW_NAME = 'Case Analytics';

/**
 * Base spec for the managed Cases data view in a single space. Runtime
 * fields are layered on by `CasesAnalyticsV2DataViewService` from the
 * same space's templates.
 *
 * Per-space scoping: templates are space-scoped SOs, so the derived
 * runtime field map is too. A global view with `namespaces: ['*']` would
 * leak space-A field definitions into space B and balloon to `N × M`
 * fields on tenants with many spaces. The underlying `.cases` index stays
 * cluster-level; only the view is per-space.
 *
 * Settings:
 *   - `managed: true`      — UI flags this as Kibana-owned; admin edits
 *                            get a "managed by application" hint.
 *   - `allowNoIndex: true` — view is creatable before docs land in `.cases`.
 *   - `timeFieldName`      — `@timestamp` (last activity at write time).
 */
export const buildCaseDataViewSpec = (spaceId: string): DataViewSpec => ({
  id: getCaseDataViewId(spaceId),
  name: CASE_DATA_VIEW_NAME,
  title: CASE_ANALYTICS_DATA_VIEW_TITLE,
  timeFieldName: '@timestamp',
  allowNoIndex: true,
  managed: true,
  namespaces: [spaceId],
  runtimeFieldMap: {},
});
