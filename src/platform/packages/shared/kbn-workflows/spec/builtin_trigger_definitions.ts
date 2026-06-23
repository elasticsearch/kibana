/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import {
  AlertRuleTriggerSchema,
  ManualTriggerSchema,
  ScheduledTriggerSchema,
} from './schema/triggers';

export interface TriggerDocumentation {
  details?: string;
  examples: string[];
}

export interface BaseTriggerDefinition {
  id: string;
  label: string;
  description: string;
  schema: z.ZodType;
  documentation: TriggerDocumentation;
}

export const builtInTriggerDefinitions: BaseTriggerDefinition[] = [
  {
    id: 'manual',
    label: 'Manual',
    description: 'Trigger a workflow manually via the UI or API',
    schema: ManualTriggerSchema,
    documentation: {
      details:
        'Optionally declare runtime inputs under the trigger using JSON Schema ' +
        '(`inputs.properties` + `inputs.required`). Reference them in steps with `{{ inputs.<name> }}`.',
      examples: [
        `triggers:
  - type: manual`,
        `triggers:
  - type: manual
    inputs:
      properties:
        request_id:
          type: string
          description: The ID of the request to accept
      required:
        - request_id`,
      ],
    },
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    description:
      'Run a workflow on a recurring schedule using a simple interval (e.g. every 5m) or an rrule for complex patterns (specific days, hours)',
    schema: ScheduledTriggerSchema,
    documentation: {
      details:
        'Supports two formats: simple interval (`every: "5m"`) for fixed-rate schedules, or `rrule` for calendar-based patterns with day-of-week, hour, and timezone control.',
      examples: [
        `triggers:
  - type: scheduled
    with:
      every: "5m"`,
        `triggers:
  - type: scheduled
    with:
      rrule:
        freq: WEEKLY
        interval: 1
        byweekday: [MO, WE, FR]
        byhour: [9]
        byminute: [0]
        tzid: America/New_York`,
      ],
    },
  },
  {
    id: 'alert',
    label: 'Alert',
    description: 'Trigger a workflow when an alerting rule fires',
    schema: AlertRuleTriggerSchema,
    documentation: {
      details:
        'When an alert trigger fires, the event data is available via `{{ event }}` (NOT `triggers.event`). ' +
        '`event.alerts` is an array of alert objects, `event.rule` contains the rule metadata (id, name, tags), ' +
        'and `event.spaceId` is the space where the event was emitted.',
      examples: [
        `triggers:
  - type: alert`,
        `# Alert-triggered workflow referencing event data in steps:
triggers:
  - type: alert
steps:
  - name: log_alert
    type: console
    with:
      message: "Alert from rule: {{ event.rule.name }}"
  - name: process_alerts
    type: foreach
    foreach: "{{ event.alerts }}"
    steps:
      - name: log_each_alert
        type: console
        with:
          message: "Alert ID: {{ foreach.item._id }}"`,
      ],
    },
  },
];

const builtInTriggerDefinitionsMap = new Map(builtInTriggerDefinitions.map((t) => [t.id, t]));

export function getBuiltInTriggerDefinition(id: string): BaseTriggerDefinition | undefined {
  return builtInTriggerDefinitionsMap.get(id);
}
