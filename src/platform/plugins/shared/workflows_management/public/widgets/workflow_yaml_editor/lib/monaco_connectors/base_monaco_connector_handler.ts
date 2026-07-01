/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { monaco } from '@kbn/monaco';
import type { StabilityLevel } from '@kbn/workflows';
import { getCachedAllConnectorsMap } from '../../../../../common/schema';
import { getCachedAllConnectors } from '../connectors_cache';
import { getStabilityBadgeHtml } from '../get_stability_note';
import type {
  ConnectorExamples,
  HoverContext,
  MonacoConnectorHandler,
} from '../monaco_providers/provider_interfaces';

/**
 * Abstract base class for Monaco connector handlers
 * Provides common functionality for Monaco editor extensions that handle specific connector types
 */
export abstract class BaseMonacoConnectorHandler implements MonacoConnectorHandler {
  protected readonly name: string;
  protected readonly priority: number;
  protected readonly supportedPrefixes: string[];

  constructor(name: string, priority: number, supportedPrefixes: string[]) {
    this.name = name;
    this.priority = priority;
    this.supportedPrefixes = supportedPrefixes;
  }

  /**
   * Check if this handler can process the given connector type
   */
  canHandle(connectorType: string): boolean {
    return this.supportedPrefixes.some((prefix) => connectorType.startsWith(prefix));
  }

  /**
   * Get priority for this handler (higher = more specific, handled first)
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Generate hover content for the connector - must be implemented by subclasses
   */
  abstract generateHoverContent(context: HoverContext): Promise<monaco.IMarkdownString | null>;

  /**
   * Get examples for the connector type - must be implemented by subclasses
   */
  abstract getExamples(connectorType: string): ConnectorExamples | null;

  /**
   * Helper method to create consistent markdown content
   */
  protected createMarkdownContent(content: string): monaco.IMarkdownString {
    return {
      value: content,
      isTrusted: true,
      supportHtml: true,
    };
  }

  /**
   * Helper method to check if we're in a specific YAML context
   */
  protected isInContext(context: HoverContext, expectedPath: string[]): boolean {
    if (context.yamlPath.length < expectedPath.length) {
      return false;
    }

    for (let i = 0; i < expectedPath.length; i++) {
      if (context.yamlPath[i] !== expectedPath[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper method to extract step information from context
   */
  protected getStepInfo(context: HoverContext): {
    stepName?: string;
    stepType?: string;
    isInWithBlock: boolean;
  } {
    const { stepContext } = context;

    return {
      stepName: stepContext?.stepName,
      stepType: stepContext?.stepType,
      isInWithBlock: stepContext?.isInWithBlock || false,
    };
  }

  /**
   * Helper method to format connector type for display
   */
  protected formatConnectorType(connectorType: string): string {
    // Remove prefixes for cleaner display
    return connectorType
      .replace(/^elasticsearch\./, '')
      .replace(/^kibana\./, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Helper method to create parameter documentation
   */
  protected createParameterDocumentation(
    paramName: string,
    paramType: string,
    description?: string,
    examples?: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  ): string {
    const lines = [`**Parameter**: \`${paramName}\` (${paramType})`];

    if (description) {
      lines.push('', description);
    }

    if (examples && examples.length > 0) {
      lines.push('', '**Examples:**');
      examples.slice(0, 3).forEach((example) => {
        if (typeof example === 'string') {
          lines.push(`- \`${example}\``);
        } else {
          lines.push(`- \`${JSON.stringify(example)}\``);
        }
      });
    }

    return lines.join('\n');
  }

  /**
   * Prepends the stability badge to hover body lines (top-left, same as trigger hovers).
   */
  protected prependStabilityBadgeToContent(
    stability: StabilityLevel | undefined,
    bodyLines: string[]
  ): string {
    const badge = getStabilityBadgeHtml(stability);
    if (!badge) {
      return bodyLines.join('\n');
    }
    return [badge, '', ...bodyLines].join('\n');
  }

  protected getConnectorStabilityFromCache(connectorType: string): StabilityLevel | undefined {
    const mapStability = getCachedAllConnectorsMap()?.get(connectorType)?.stability;
    const listStability = getCachedAllConnectors().find((c) => c.type === connectorType)?.stability;
    const stability = mapStability ?? listStability;
    if (stability === 'tech_preview' || stability === 'beta') {
      return stability;
    }
    return undefined;
  }

  /**
   * Helper method to create connector overview documentation
   */
  protected createConnectorOverview(
    connectorType: string,
    description: string,
    additionalInfo?: string[]
  ): string {
    const lines = [`**Connector**: \`${connectorType}\``, '', description];

    if (additionalInfo && additionalInfo.length > 0) {
      lines.push('', ...additionalInfo);
    }

    return lines.join('\n');
  }
}
