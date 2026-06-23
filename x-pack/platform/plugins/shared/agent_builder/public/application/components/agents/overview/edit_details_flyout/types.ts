/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentAccessControl } from '@kbn/agent-builder-common';

export interface EditDetailsFormData {
  name: string;
  description: string;
  avatar_symbol: string;
  avatar_color: string;
  labels: string[];
  access_control: AgentAccessControl;
  configuration: {
    enable_elastic_capabilities: boolean;
    workflow_ids: string[];
    instructions: string;
  };
}
