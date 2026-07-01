/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { monaco } from '@kbn/monaco';
import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { BaseMonacoConnectorHandler } from './base_monaco_connector_handler';
import { stepSchemas } from '../../../../../common/step_schemas';
import { getExtensionStability } from '../get_stability_note';
import type { ConnectorExamples, HoverContext } from '../monaco_providers/provider_interfaces';

/**
 * Generic Monaco connector handler for unknown/unsupported connector types
 * Provides basic hover information and examples for any connector type
 */
export class CustomMonacoStepHandler extends BaseMonacoConnectorHandler {
  private readonly registeredStepsMap: Map<string, PublicStepDefinition>;

  constructor() {
    // Priority 80 - catches all custom step types
    super('CustomMonacoStepHandler', 80, ['']); // Empty prefix, canHandle will check if the step is registered
    this.registeredStepsMap = new Map<string, PublicStepDefinition>(
      stepSchemas
        .getAllRegisteredStepDefinitions()
        .map((step) => [step.id, step as PublicStepDefinition])
    );
  }

  canHandle(connectorType: string): boolean {
    return this.registeredStepsMap.has(connectorType);
  }

  /**
   * Generate generic hover content for unknown connectors
   */
  async generateHoverContent(context: HoverContext): Promise<monaco.IMarkdownString | null> {
    try {
      const { connectorType, stepContext } = context;

      if (!stepContext) {
        return null;
      }

      // Get step definition
      const stepDefinition = this.registeredStepsMap.get(connectorType);
      if (!stepDefinition) {
        return null;
      }

      const bodyLines = [
        `**Workflow step**: \`${stepDefinition.label}\``,
        '',
        `**Type**: \`${stepDefinition.id}\``,
        '',
        `**Summary**: ${stepDefinition.description}`,
      ];
      if (stepDefinition.documentation?.details) {
        bodyLines.push('', `**Description**: ${stepDefinition.documentation.details}`);
      }
      if (stepDefinition.documentation?.url) {
        bodyLines.push('', `**Documentation**: ${stepDefinition.documentation.url}`);
      }
      if (stepDefinition.documentation?.examples) {
        bodyLines.push('', '**Examples**:', stepDefinition.documentation.examples.join('\n'));
      }

      bodyLines.push('', '_💡 Tip: Check the step documentation for specific parameter details_');

      return this.createMarkdownContent(
        this.prependStabilityBadgeToContent(getExtensionStability(stepDefinition), bodyLines)
      );
    } catch (error) {
      // console.warn('GenericMonacoConnectorHandler: Error generating hover content', error);
      return null;
    }
  }

  /**
   * Get basic examples for generic connector types
   */
  getExamples(connectorType: string): ConnectorExamples | null {
    const stepDefinition = this.registeredStepsMap.get(connectorType);
    if (!stepDefinition) {
      return null;
    }

    // Return category-specific examples
    if (stepDefinition.documentation?.examples) {
      return {
        params: stepDefinition.documentation.examples,
        snippet: `- name: ${connectorType.replace(/[^a-zA-Z0-9]/g, '_')}_step
  type: ${connectorType}
  with:
${stepDefinition.documentation.examples
  .map(
    ([key, value]) =>
      `    ${key}: ${typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}`
  )
  .join('\n')}`,
      };
    }

    return null;
  }
}
