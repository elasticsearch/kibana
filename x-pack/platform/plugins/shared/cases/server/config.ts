/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema, offeringBasedSchema } from '@kbn/config-schema';
import { ALLOWED_MIME_TYPES } from '../common/constants/mime_types';
import {
  DEFAULT_TASK_INTERVAL_MINUTES,
  DEFAULT_TASK_START_DELAY_MINUTES,
} from '../common/constants/incremental_id';

export const ConfigSchema = schema.object({
  analytics: schema.object({
    index: schema.object({
      enabled: offeringBasedSchema({
        serverless: schema.boolean({ defaultValue: false }),
        traditional: schema.boolean({ defaultValue: false }),
      }),
    }),
  }),
  /**
   * Cases-as-data v2 — cluster-level analytics index populated by real-time
   * saved-object hooks (see `server/cases_analytics_v2`). Off by default; v1
   * (`analytics.index.enabled`) is the primary path until v2 has been validated
   * in production. Enabling v2 has no effect on v1 — they coexist independently.
   */
  analyticsV2: schema.object({
    enabled: schema.boolean({ defaultValue: false }),
    /**
     * Reconciliation cadence in minutes. The reconciliation task is the
     * durability backstop for v2's fire-and-forget write hooks: every
     * tick it walks cases updated since the previous tick and re-emits
     * their analytics docs. Lower values catch up faster after a hook
     * failure but cost more SO walks against the cases index.
     *
     * Defaults to 30 minutes — fast enough to recover from dropped hooks
     * within an on-call response window, slow enough to keep background
     * read load negligible. Hard floor of 5 minutes prevents misconfigured
     * deployments from hammering ES.
     */
    reconciliationIntervalMinutes: schema.number({
      defaultValue: 30,
      min: 5,
    }),
    /**
     * Gates the cases-analyticsV2 administrator routes that mutate
     * subsystem state — `POST /internal/cases/_analyticsV2/reset` and
     * `POST /internal/cases/_analyticsV2/reconcile/run_soon`. The
     * read-only `GET /internal/cases/_analyticsV2/state` is always
     * registered (it's the surface a future Case Settings page will
     * poll for health info; gating it would break that integration).
     *
     * Default `false` because both gated routes operate **globally**
     * across every space but are invocable from a single space — an
     * administrator hitting `/reset` from `default` wipes case data views
     * in every space the cluster knows about. That's exactly what the
     * route is designed for, but a misclick from an unaware tenant can
     * be disruptive. Keeping it off by default forces administrators to
     * opt in via `xpack.cases.analyticsV2.enableAdminRoutes: true` in
     * `kibana.yml`, which is also the right knob for repeated dev /
     * test invocations during local development.
     *
     * Lives under `analyticsV2` (not the legacy `analytics` namespace,
     * which is the v1-only surface and will eventually be removed) so
     * the gating contract retires alongside the v2 service if both are
     * ever sunset together.
     */
    enableAdminRoutes: schema.boolean({ defaultValue: false }),
    /**
     * Wall-clock budget for the one-shot reset task scheduled by
     * `POST /internal/cases/_analyticsV2/reset`. The reset task does a
     * full re-walk of every case across every space, which is
     * `O(documents)` not `O(spaces)`. At small/medium tenant sizes
     * (≤ ~2K spaces) the default 60 minutes is comfortable. At larger
     * tenants it must be raised — measured wall-clock at 10K spaces
     * with default `resetPageDelayMs` is ~10 minutes for the cases
     * surface alone. The 24-hour ceiling (`max: 1440`) prevents
     * typo-driven zombie tasks from holding a Task Manager slot
     * indefinitely.
     *
     * Tuning this DOES NOT touch the periodic reconciliation task — that
     * one runs `O(delta)` and finishes in seconds regardless of tenant
     * size, so it doesn't need a separate timeout knob.
     */
    resetTaskTimeoutMinutes: schema.number({
      defaultValue: 60,
      min: 5,
      max: 1440,
    }),
    /**
     * Inter-page sleep applied between reconciliation runner pages
     * **only when the runner is invoked from the reset task** (not from
     * the periodic task). Default `0` keeps the post-reset backfill as
     * fast as possible — the right behaviour for most administrators,
     * who just want `/reset` to converge.
     *
     * Administrators on shared / capacity-constrained ES clusters can
     * raise this to throttle the bulk-write pressure the backfill puts
     * on the cluster. The trade-off is wall-clock vs cluster
     * friendliness — a backfill is a one-shot operation, so accepting a
     * longer wall-clock to be a better neighbour to other workloads is
     * often the right call on busy clusters.
     *
     * 5-second ceiling — beyond that it's not throttling, it's stalling.
     */
    resetPageDelayMs: schema.number({
      defaultValue: 0,
      min: 0,
      max: 5000,
    }),
  }),
  attachments: schema.object({
    enabled: schema.boolean({ defaultValue: false }),
  }),
  markdownPlugins: schema.object({
    lens: schema.boolean({ defaultValue: true }),
  }),
  files: schema.object({
    allowedMimeTypes: schema.arrayOf(schema.string({ minLength: 1 }), {
      defaultValue: ALLOWED_MIME_TYPES,
    }),
    // intentionally not setting a default here so that we can determine if the user set it
    maxSize: schema.maybe(schema.number({ min: 0 })),
  }),
  incrementalId: schema.object({
    /**
     * Whether the incremental id service should be enabled
     */
    enabled: schema.boolean({ defaultValue: true }),
    /**
     * The interval that the task should be scheduled at
     */
    taskIntervalMinutes: schema.number({
      defaultValue: DEFAULT_TASK_INTERVAL_MINUTES,
      min: 5,
    }),
    /**
     * The initial delay the task will be started with
     */
    taskStartDelayMinutes: schema.number({
      defaultValue: DEFAULT_TASK_START_DELAY_MINUTES,
      min: 1,
    }),
  }),
  stack: schema.object({
    enabled: schema.boolean({ defaultValue: true }),
  }),
  // NOTE: exposed to the Browser via `exposeToBrowser` setting in cases/server/index.ts
  // WARN: enabling this feature and disabling it later is not supported (saved objects will throw errors)
  templates: schema.object({
    enabled: schema.boolean({ defaultValue: false }),
  }),
  // NOTE: exposed to the Browser via `exposeToBrowser` setting in cases/server/index.ts
  // Temporary feature flag for the Cases UX redesign (elastic/security-team#17398).
  // Once the redesigned UI fully replaces the current one, this config block will be removed.
  casesRedesign: schema.object({
    list: schema.boolean({ defaultValue: false }),
    details: schema.boolean({ defaultValue: false }),
    settings: schema.boolean({ defaultValue: false }),
  }),
  enabled: schema.boolean({ defaultValue: true }),
});

export type ConfigType = TypeOf<typeof ConfigSchema>;
