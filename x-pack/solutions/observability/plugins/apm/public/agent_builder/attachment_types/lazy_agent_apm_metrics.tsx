/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dynamic } from '@kbn/shared-ux-utility';

export type { AgentApmMetricsProps } from './agent_apm_metrics';

export const LazyAgentApmMetrics = dynamic(() =>
  import('./agent_apm_metrics').then((mod) => ({
    default: mod.AgentApmMetrics,
  }))
);
