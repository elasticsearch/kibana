/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Template } from 'liquidjs';
import { i18n } from '@kbn/i18n';
import type { LiquidSettings } from '@kbn/workflows';
import { createWorkflowLiquidEngine } from '@kbn/workflows';

type TemplateVariableSegment = string | number;
type TemplateVariableSegments = TemplateVariableSegment[];

interface WorkflowTemplatingEngineOptions {
  liquidSettings?: LiquidSettings;
}

export class WorkflowTemplatingEngine {
  /**
   * Liquid tags that are not supported in workflow templates.
   */
  private static readonly UNSUPPORTED_TAG_PATTERN = /\{%-?\s*(include|render|layout)\s/i;
  private static readonly TEMPLATE_SYNTAX_PATTERN = /\{\{|\{%/;
  private static readonly PARSED_TEMPLATE_CACHE_SIZE = 64;
  private static readonly VARIABLE_SEGMENTS_CACHE_SIZE = 64;
  private static readonly LIQUID_LIMIT_ERRORS = new Set([
    'memory alloc limit exceeded',
    'parse length limit exceeded',
    'render limit exceeded',
    'template render limit exceeded',
  ]);
  private static readonly LIQUID_LIMIT_ERROR_MESSAGE = i18n.translate(
    'workflowsExecutionEngine.templatingEngine.liquidLimitExceededErrorMessage',
    {
      defaultMessage:
        'Liquid template rendering exceeded a workflow limit. Reduce the template size, simplify loops or filters, reduce the rendered output size, or override the limit in workflow settings and try again.',
    }
  );

  private readonly engine;
  private readonly parsedTemplateCache = new Map<string, Template[]>();
  private readonly variableSegmentsCache = new Map<string, TemplateVariableSegments[] | null>();

  constructor(options?: WorkflowTemplatingEngineOptions) {
    const { liquidSettings } = options ?? {};

    this.engine = createWorkflowLiquidEngine({
      strictFilters: true,
      strictVariables: false,
      parseLimit: liquidSettings?.parseLimit,
      renderLimit: liquidSettings?.renderLimit,
      memoryLimit: liquidSettings?.memoryLimit,
    });

    // register json_parse filter that converts JSON string to object
    this.engine.registerFilter('json_parse', (value: unknown): unknown => {
      if (typeof value !== 'string') {
        return value;
      }
      try {
        return JSON.parse(value);
      } catch (error) {
        return value;
      }
    });

    // register entries filter that converts an object into an array of {key, value} pairs
    this.engine.registerFilter('entries', (value: unknown): unknown => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return value;
      }
      return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
    });
  }

  public render<T>(obj: T, context: Record<string, unknown>): T {
    return this.renderValueRecursively(obj, context) as T;
  }

  public evaluateExpression(template: string, context: Record<string, unknown>): unknown {
    this.validateTemplate(template);

    let resolvedExpression = template.trim();
    const openExpressionIndex = resolvedExpression.indexOf('{{');
    const closeExpressionIndex = resolvedExpression.lastIndexOf('}}');

    if (openExpressionIndex === -1 || closeExpressionIndex === -1) {
      throw new Error(`The provided expression is invalid. Got: ${template}.`);
    }

    resolvedExpression = resolvedExpression
      .substring(openExpressionIndex + 2, closeExpressionIndex)
      .trim();

    try {
      return this.engine.evalValueSync(resolvedExpression, context);
    } catch (err) {
      throw new Error(`The provided expression is invalid. Got: ${template}.`);
    }
  }

  public extractGlobalVariableSegments(value: unknown): TemplateVariableSegments[] | null {
    const segments: TemplateVariableSegments[] = [];
    const extracted = this.extractGlobalVariableSegmentsRecursively(value, segments);
    return extracted ? segments : null;
  }

  private renderValueRecursively(value: unknown, context: Record<string, unknown>): unknown {
    // Handle null and undefined
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string' && value.startsWith('${{') && value.endsWith('}}')) {
      // remove the first $ only as the evaluateExpression removes the {{ and }} later
      return this.evaluateExpression(value.substring(1), context);
    }

    // Handle string values - render them using the template engine
    if (typeof value === 'string') {
      return this.renderString(value, context);
    }

    // Handle arrays - recursively render each element
    if (Array.isArray(value)) {
      return value.map((item) => this.renderValueRecursively(item, context));
    }

    // Handle objects - recursively render each property
    if (typeof value === 'object') {
      const renderedObject: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        renderedObject[key] = this.renderValueRecursively(val, context);
      }
      return renderedObject;
    }

    // Return primitive values as-is (numbers, booleans, etc.)
    return value;
  }

  /**
   * Validates that a template string does not use unsupported Liquid tags.
   */
  private validateTemplate(template: string): void {
    if (WorkflowTemplatingEngine.UNSUPPORTED_TAG_PATTERN.test(template)) {
      throw new Error('Template contains unsupported tags.');
    }
  }

  private renderString(template: string, context: Record<string, unknown>): string {
    try {
      this.validateTemplate(template);
      return this.engine.renderSync(this.getParsedTemplate(template), context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // customer-facing error message without the default line number and column number
      const customerFacingErrorMessage = errorMessage.replace(/, line:\d+, col:\d+/g, '');
      throw new Error(
        WorkflowTemplatingEngine.LIQUID_LIMIT_ERRORS.has(customerFacingErrorMessage)
          ? WorkflowTemplatingEngine.LIQUID_LIMIT_ERROR_MESSAGE
          : customerFacingErrorMessage
      );
    }
  }

  private extractGlobalVariableSegmentsRecursively(
    value: unknown,
    segments: TemplateVariableSegments[]
  ): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === 'string') {
      const extractedSegments = this.extractTemplateVariableSegments(value);
      if (extractedSegments === null) {
        return false;
      }
      segments.push(...extractedSegments);
      return true;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!this.extractGlobalVariableSegmentsRecursively(item, segments)) {
          return false;
        }
      }
      return true;
    }

    if (typeof value === 'object') {
      for (const nestedValue of Object.values(value)) {
        if (!this.extractGlobalVariableSegmentsRecursively(nestedValue, segments)) {
          return false;
        }
      }
    }

    return true;
  }

  private extractTemplateVariableSegments(template: string): TemplateVariableSegments[] | null {
    const normalizedTemplate =
      template.startsWith('${{') && template.endsWith('}}') ? template.substring(1) : template;

    if (!WorkflowTemplatingEngine.TEMPLATE_SYNTAX_PATTERN.test(normalizedTemplate)) {
      return [];
    }

    const cached = this.variableSegmentsCache.get(normalizedTemplate);
    if (cached !== undefined) {
      this.variableSegmentsCache.delete(normalizedTemplate);
      this.variableSegmentsCache.set(normalizedTemplate, cached);
      return cached;
    }

    try {
      this.validateTemplate(normalizedTemplate);
      const allSegments = this.engine.globalVariableSegmentsSync(
        this.getParsedTemplate(normalizedTemplate)
      );
      const extractedSegments = allSegments.filter((path): path is TemplateVariableSegments =>
        path.every(
          (segment): segment is TemplateVariableSegment =>
            typeof segment === 'string' || typeof segment === 'number'
        )
      );

      const result = extractedSegments.length === allSegments.length ? extractedSegments : null;

      this.setVariableSegmentsCache(normalizedTemplate, result);
      return result;
    } catch {
      this.setVariableSegmentsCache(normalizedTemplate, null);
      return null;
    }
  }

  private getParsedTemplate(template: string): Template[] {
    const cached = this.parsedTemplateCache.get(template);
    if (cached) {
      this.parsedTemplateCache.delete(template);
      this.parsedTemplateCache.set(template, cached);
      return cached;
    }

    const parsedTemplate = this.engine.parse(template);
    this.parsedTemplateCache.set(template, parsedTemplate);
    if (this.parsedTemplateCache.size > WorkflowTemplatingEngine.PARSED_TEMPLATE_CACHE_SIZE) {
      const oldestKey = this.parsedTemplateCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.parsedTemplateCache.delete(oldestKey);
      }
    }

    return parsedTemplate;
  }

  private setVariableSegmentsCache(
    template: string,
    segments: TemplateVariableSegments[] | null
  ): void {
    this.variableSegmentsCache.set(template, segments);
    if (this.variableSegmentsCache.size > WorkflowTemplatingEngine.VARIABLE_SEGMENTS_CACHE_SIZE) {
      const oldestKey = this.variableSegmentsCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.variableSegmentsCache.delete(oldestKey);
      }
    }
  }
}
