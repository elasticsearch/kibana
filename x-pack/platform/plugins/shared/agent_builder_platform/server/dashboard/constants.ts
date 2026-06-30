/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Stable saved object id for the managed Agent Builder overview dashboard. */
export const AGENT_BUILDER_OVERVIEW_DASHBOARD_ID = 'agent-builder-overview';

/** Version of the Agent Builder overview dashboard. */
export const AGENT_BUILDER_OVERVIEW_DASHBOARD_VERSION = 2;
/** Placeholder in dashboard ES|QL queries replaced with the Kibana space namespace at install time. */
export const AGENT_BUILDER_TRACES_NAMESPACE_PLACEHOLDER = '__AGENT_BUILDER_TRACES_NAMESPACE__';

/**
 * Pin the dashboard SO past the legacy embeddable migrations. Without these the SO
 * migrator runs Lens migrations from 7.13.1 onward, which expect the pre-8.6
 * `indexpattern` datasource shape and crash on the modern shape we ship.
 * Reference: x-pack/platform/plugins/shared/inference/server/dashboard/install_dashboard.ts
 */
export const AGENT_BUILDER_DASHBOARD_CORE_MIGRATION_VERSION = '8.8.0';
export const AGENT_BUILDER_DASHBOARD_TYPE_MIGRATION_VERSION = '10.3.0';
