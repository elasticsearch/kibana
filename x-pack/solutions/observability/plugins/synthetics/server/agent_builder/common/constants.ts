/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { internalNamespaces } from '@kbn/agent-builder-common/base/namespaces';

export const SYNTHETICS_TOOL_NAMESPACE = `${internalNamespaces.observability}.synthetics` as const;

const syntheticsTool = (name: string) => `${SYNTHETICS_TOOL_NAMESPACE}.${name}`;

export const syntheticsTools = {
  manageMonitor: syntheticsTool('manage_monitor'),
} as const;

export const MONITOR_MANAGEMENT_SKILL_ID = 'observability.synthetics.monitor-management' as const;
