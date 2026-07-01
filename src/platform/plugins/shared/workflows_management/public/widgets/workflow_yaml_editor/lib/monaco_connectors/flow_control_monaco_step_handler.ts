/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { monaco } from '@kbn/code-editor';
import { getBuiltInStepDefinition, getBuiltInStepStability } from '@kbn/workflows';
import { BaseMonacoConnectorHandler } from './base_monaco_connector_handler';
import type { ConnectorExamples, HoverContext } from '../monaco_providers/provider_interfaces';

const FLOW_CONTROL_STEP_TYPES = ['wait', 'waitForInput', 'waitForApproval'] as const;

export class FlowControlMonacoStepHandler extends BaseMonacoConnectorHandler {
  constructor() {
    super('FlowControlMonacoStepHandler', 80, ['wait']);
  }

  canHandle(connectorType: string): boolean {
    return (FLOW_CONTROL_STEP_TYPES as readonly string[]).includes(connectorType);
  }

  async generateHoverContent(context: HoverContext): Promise<monaco.IMarkdownString | null> {
    const { connectorType, stepContext } = context;
    if (!stepContext) {
      return null;
    }

    const stepDefinition = getBuiltInStepDefinition(connectorType);
    if (!stepDefinition) {
      return null;
    }

    const example = stepDefinition.documentation?.examples?.[0];
    const parameterLines =
      connectorType === 'waitForInput'
        ? [
            '- `message` _(optional)_ — Message displayed to the user when waiting for input',
            '- `schema` _(optional)_ — JSON Schema describing the expected input payload',
          ]
        : connectorType === 'waitForApproval'
        ? [
            '- `message` _(optional)_ — Message displayed to approvers',
            '- `approveLabel` _(optional)_ — Label for the approve action (default: Approve)',
            '- `rejectLabel` _(optional)_ — Label for the reject action (default: Decline)',
            '- `channels` _(optional)_ — External notification channels (`slack`, `slack_api`)',
          ]
        : ['- `duration` _(required)_ — Duration to wait, e.g. `"5s"`, `"1m"`, `"2h"`'];

    const content = this.prependStabilityBadgeToContent(getBuiltInStepStability(connectorType), [
      `**Step**: \`${connectorType}\``,
      '',
      `**${stepDefinition.label}** — ${stepDefinition.description}`,
      '',
      '**Parameters:**',
      ...parameterLines,
      ...(example ? ['', '**Example:**', '', '```yaml', example, '```'] : []),
    ]);

    return this.createMarkdownContent(content);
  }

  getExamples(connectorType: string): ConnectorExamples | null {
    const example = getBuiltInStepDefinition(connectorType)?.documentation?.examples?.[0];
    return example ? { snippet: example } : null;
  }
}
