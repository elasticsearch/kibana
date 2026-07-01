/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import type { StepDeprecationInfo } from './deprecated_step_metadata';
import type { StabilityLevel } from '../types/v1';

export enum StepCategory {
  Elasticsearch = 'elasticsearch',
  External = 'external',
  Ai = 'ai',
  Kibana = 'kibana',
  KibanaCases = 'kibana.cases',
  KibanaSecurity = 'kibana.security',
  Data = 'data',
  FlowControl = 'flowControl',
}

export const StepCategories = Object.values(StepCategory) as StepCategory[];

/**
 * Documentation information for a workflow step.
 */
export interface StepDocumentation {
  /**
   * Detailed description with usage examples (markdown supported)
   * @example "This step allows you to set variables that can be accessed in subsequent steps via `{{ steps.stepName.variableName }}`"
   */
  details?: string;

  /**
   * External documentation URL
   * @example "https://docs.example.com/custom-steps/setvar"
   */
  url?: string;

  /**
   * Usage examples in YAML format
   * @example
   * ```yaml
   * - name: myStep
   *   type: setvar
   *   with:
   *     variables:
   *       x: 10
   * ```
   */
  examples?: string[];
}

/**
 * Base interface for all step definitions across the workflows system.
 * Both built-in steps (if, foreach, wait, data.set) and registry-based steps
 * (connector steps, AI steps, etc.) extend this interface.
 */
export interface BaseStepDefinition<
  InputSchema extends z.ZodType = z.ZodType,
  OutputSchema extends z.ZodType = z.ZodType,
  ConfigSchema extends z.ZodObject = z.ZodObject
> {
  /**
   * Unique identifier for this step type.
   * Should follow a namespaced format (e.g., "ai.prompt", "data.set", "elasticsearch.search").
   */
  id: string;

  /**
   * User-facing label/title for this step type.
   * Displayed in the UI when selecting or viewing steps.
   */
  label: string;

  /**
   * Human-readable description of what this step does.
   */
  description: string;

  /**
   * Category grouping for this step type.
   */
  category: StepCategory;

  /**
   * Zod schema for validating step input (the `with` block in YAML).
   * The input type is automatically inferred from this schema.
   */
  inputSchema: InputSchema;

  /**
   * Zod schema for validating step output.
   * The output type is automatically inferred from this schema.
   */
  outputSchema: OutputSchema;

  /**
   * Zod schema for validating step config properties.
   * Defines config properties that appear at the step level (outside the `with` block).
   * Example: `connector-id` for connector steps, `condition` for if steps.
   */
  configSchema?: ConfigSchema;

  /**
   * Documentation for the step, including details and examples.
   */
  documentation?: StepDocumentation;

  /**
   * API stability level for this step (e.g. 'tech_preview', 'beta', 'stable').
   * Built-in steps: omit means stable (no badge). Extension-registered steps: omit
   * defaults to tech_preview in the UI; set 'stable' explicitly to graduate.
   */
  stability?: StabilityLevel;

  /**
   * Deprecation metadata for this step type.
   * Deprecated steps remain valid for existing workflows, but should not be
   * suggested for new workflows.
   */
  deprecation?: StepDeprecationInfo;
}
