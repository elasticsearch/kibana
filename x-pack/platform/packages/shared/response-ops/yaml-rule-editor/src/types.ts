/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLCallbacks } from '@kbn/esql-types';

/**
 * Context information for ES|QL query within YAML
 */
export interface QueryContext {
  /** The matched property name (e.g., 'query') */
  propertyName: string;
  /** The ES|QL query text */
  queryText: string;
  /** The cursor offset within the query text */
  queryOffset: number;
}

/**
 * Schema property information extracted from JSON schema
 */
export interface SchemaPropertyInfo {
  key: string;
  description?: string;
  /** Formatted type string for display (e.g., "string", "number", "string[]", '"a" | "b"') */
  type: string;
  isEnum?: boolean;
  enumValues?: string[];
}

/**
 * JSON Schema type definition
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  description?: string;
  enum?: Array<string | number | boolean>;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  $defs?: Record<string, JsonSchema>;
  default?: unknown;
}

/**
 * Completion context for YAML editing
 */
export interface CompletionContext {
  parentPath: string[];
  currentKey: string | null;
  isValuePosition: boolean;
}

/**
 * YAML property names whose values contain ES|QL queries.
 * The editor enables ES|QL syntax highlighting and auto-completion for these fields.
 *
 * TODO: with zod4 upgrade we can add a metadata tag to the schema to mark these fields as ES|QL queries.
 */
export const DEFAULT_ESQL_PROPERTY_NAMES = ['base'];

/**
 * Props for the YamlRuleEditor component
 */
export interface YamlRuleEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Called when the editor text loses focus. Useful for "user paused editing"
   * triggers like syncing parsed YAML back into a parent form's state.
   */
  onBlur?: () => void;
  esqlCallbacks: ESQLCallbacks;
  /**
   * Property names in YAML that should be treated as ES|QL queries.
   * Values of these properties will get ES|QL syntax highlighting and auto-completion.
   * @default ['query']
   */
  esqlPropertyNames?: string[];
  isReadOnly?: boolean;
  height?: number | string;
  dataTestSubj?: string;
  /**
   * Called whenever the editor re-runs YAML schema validation. `hasErrors` is
   * true if any Monaco marker was set by the editor's schema validator (YAML
   * syntax errors or zod schema issues). Lets the parent block submission
   * while the buffer is invalid.
   */
  onValidate?: (hasErrors: boolean) => void;
}
