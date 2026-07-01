/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';

const librarySchema = schema.object(
  {
    /**
     * URL prefix the HTTP source mode fetches the catalog from. When unset,
     * the runtime falls back to {@link WORKFLOWS_LIBRARY_DEFAULT_REGISTRY_URL}.
     * Mutually exclusive with `bundlePath`.
     */
    registryUrl: schema.maybe(schema.string({ minLength: 1 })),
    /**
     * Filesystem path to a local catalog bundle (air-gapped deployments).
     * Reserved for the bundle-mode successor task; the HTTP source mode is the
     * only mode implemented in Phase 2. Mutually exclusive with `registryUrl`.
     */
    bundlePath: schema.maybe(schema.string({ minLength: 1 })),
    /** Interval between background catalog refreshes (HTTP source mode). */
    ttlMs: schema.number({
      defaultValue: 10 * 60 * 1000,
      min: 10 * 1000,
    }),
  },
  {
    validate: (value) => {
      if (value.registryUrl !== undefined && value.bundlePath !== undefined) {
        return '`workflowsManagement.library.registryUrl` and `workflowsManagement.library.bundlePath` cannot both be set.';
      }
    },
  }
);

const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  logging: schema.object({
    console: schema.boolean({ defaultValue: false }),
  }),
  /**
   * Whether the plugin is available in the current offering pricing model.
   * This is used to turn off workflows management server features via config in specific serverless tiers,
   * without completely disabling the plugin.
   */
  available: schema.boolean({ defaultValue: true }),
  /**
   * Global workflow executions list (`/app/workflows/executions`). Not exposed in Advanced Settings;
   * enable via `workflowsManagement.globalExecutionsView.enabled` in `kibana.yml`.
   */
  globalExecutionsView: schema.object({
    enabled: schema.boolean({ defaultValue: false }),
  }),
  /**
   * Workflow Template Library — fetches the curated catalog and exposes it at
   * `/internal/workflows/library/*`. Server-only infrastructure settings; the
   * tech-preview enable/disable toggle is the `workflowsManagement:library:enabled`
   * global uiSetting (so browser components can read it without depending on
   * this plugin).
   */
  library: librarySchema,
});

export type WorkflowsManagementConfig = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<WorkflowsManagementConfig> = {
  schema: configSchema,
  exposeToBrowser: {
    globalExecutionsView: true,
  },
};
