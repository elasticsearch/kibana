/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID, ALERTZERO_WORKER_MANAGEMENT } from './constants';
import DETECTION_RULE_TUNING_YAML from './detection_rule_tuning.yaml';
import {
  renderScheduledWorkerYaml,
  type ScheduledWorkerTemplateValues,
} from './worker_template_values';
import type { ManagedWorkflowDefinition } from '../../types';

export const ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID =
  'system-security-detection-rule-tuning';

export const ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW = {
  billable: false,
  id: ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
  management: ALERTZERO_WORKER_MANAGEMENT,
  pluginId: ALERTZERO_MANAGED_WORKFLOW_PLUGIN_ID,
  version: 5,
  yamlTemplate: (values: ScheduledWorkerTemplateValues): string =>
    renderScheduledWorkerYaml(DETECTION_RULE_TUNING_YAML, values),
} as const satisfies ManagedWorkflowDefinition<ScheduledWorkerTemplateValues>;
