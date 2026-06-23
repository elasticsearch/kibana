/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as yamlParse } from 'yaml';
import { pick, rng, sampleN } from './utils';

// Source-of-truth kitchen-sink template definition. Edit this YAML to change
// the default template the generator creates when --templates > 0 and no
// --templateFieldTypes are supplied. Matches the schema parsed server-side by
// x-pack/.../cases/server/routes/api/templates/parse_template.ts.
//
// Comments are kept here in source for readability — they are not preserved
// on YAML re-emit and are not relevant to the cases server.
export const KITCHEN_SINK_TEMPLATE_YAML = `# name is required
name: Example template
# description is optional
description: A short description of the template
# severity is optional (low, medium, high, critical)
severity: low
# category is optional
category: General
# tags are optional
tags:
  - example
fields:
  - name: start_date
    control: DATE_PICKER
    label: Start date
    type: date
    metadata:
      default: "2024-01-01T00:00:00Z"
      # set to true to include time selection
      # show_time: true
      # 'utc' (default) or 'local' to use the browser's timezone
      # timezone: local
  - name: summary
    control: INPUT_TEXT
    label: Summary
    type: keyword
    metadata:
      default: Default summary text
  - name: effort
    control: INPUT_NUMBER
    label: Effort estimate
    type: integer
    metadata:
      default: 1
  - name: details
    control: TEXTAREA
    label: Details
    type: keyword
    metadata:
      default: Enter details here...
  - name: priority
    control: SELECT_BASIC
    label: Priority
    type: keyword
    metadata:
      default: medium
      options:
        - low
        - medium
        - high
        - urgent
  # display.show_when hides this field unless priority is urgent
  - name: urgency_reason
    control: TEXTAREA
    label: Reason for urgency
    type: keyword
    display:
      show_when:
        field: priority
        operator: eq
        value: urgent
    validation:
      required_when:
        field: priority
        operator: eq
        value: urgent
      pattern:
        regex: "^[A-Z]"
        message: "Must start with a capital letter"
  - name: score
    control: INPUT_NUMBER
    label: Score
    type: integer
    metadata:
      default: 80
    validation:
      required: true
      min: 0
      max: 100
  # resolution_summary must be provided before the case can be closed
  - name: resolution_summary
    control: TEXTAREA
    label: Resolution summary
    type: keyword
    validation:
      required_on_close: true
  # DATE_PICKER with show_time enabled and local timezone
  # show_when: not_empty — this field appears only when a date is selected above
  - name: scheduled_at
    control: DATE_PICKER
    label: Scheduled date and time
    type: date
    metadata:
      show_time: true
      timezone: local
  # deadline_notes is shown and required only when scheduled_at has been filled in
  - name: deadline_notes
    control: TEXTAREA
    label: Deadline notes
    type: keyword
    display:
      show_when:
        field: scheduled_at
        operator: not_empty
    validation:
      required_when:
        field: scheduled_at
        operator: not_empty
  # kickoff_agenda is shown only when scheduled_at equals a specific ISO datetime value
  - name: kickoff_agenda
    control: TEXTAREA
    label: Kickoff agenda
    type: keyword
    display:
      show_when:
        field: scheduled_at
        operator: eq
        value: "2024-06-01T09:00:00.000Z"
  # RADIO_GROUP: select exactly one option, requires at least 2 options (max 20)
  - name: environment
    control: RADIO_GROUP
    label: Environment
    type: keyword
    metadata:
      options:
        - development
        - staging
        - production
      default: staging
    display:
      show_when:
        combine: all
        rules:
          - field: affected_components
            operator: contains
            value: api
          - field: affected_components
            operator: contains
            value: ui
  # CHECKBOX_GROUP: select 0-N options, optional defaults
  - name: affected_components
    control: CHECKBOX_GROUP
    label: Affected components
    type: keyword
    metadata:
      options:
        - api
        - ui
        - database
        - auth
        - infrastructure
      default:
        - api
  # shown only when "database" is among the selected components
  - name: db_connection
    control: INPUT_TEXT
    label: Database connection string
    type: keyword
    display:
      show_when:
        field: affected_components
        operator: contains
        value: database
    validation:
      required_when:
        field: affected_components
        operator: contains
        value: database
  # shown only when "auth" is among the selected components
  - name: auth_details
    control: TEXTAREA
    label: Auth provider details
    type: keyword
    display:
      show_when:
        field: affected_components
        operator: contains
        value: auth
  # shown only when BOTH "api" and "ui" are selected (compound all condition)
  - name: integration_notes
    control: TEXTAREA
    label: Integration test notes
    type: keyword
    display:
      show_when:
        combine: all
        rules:
          - field: affected_components
            operator: contains
            value: api
          - field: affected_components
            operator: contains
            value: ui
          - field: environment
            operator: eq
            value: production
`;

interface KitchenSinkValidationPattern {
  regex: string;
  message?: string;
}

interface KitchenSinkValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: KitchenSinkValidationPattern;
  // required_when is preserved on the parsed definition but isn't used by the
  // value sampler; we just always set a value so cases can carry every field.
  required_when?: Record<string, unknown>;
  // required_on_close is declarative only; close-time enforcement is a follow-up.
  required_on_close?: boolean;
}

interface KitchenSinkMetadata {
  default?: unknown;
  options?: string[];
  show_time?: boolean;
  timezone?: 'utc' | 'local';
}

// Schema type as declared on the template field; matches the extended_fields
// key suffix the cases server expects (`<name>_as_<schemaType>`).
export type KitchenSinkFieldSchemaType = 'date' | 'integer' | 'keyword';

export interface KitchenSinkFieldDef {
  name: string;
  control: string;
  label?: string;
  type: KitchenSinkFieldSchemaType;
  metadata?: KitchenSinkMetadata;
  validation?: KitchenSinkValidation;
  display?: Record<string, unknown>;
}

export interface KitchenSinkTemplateDefinition {
  name: string;
  description?: string;
  severity?: string;
  category?: string;
  tags?: string[];
  fields: KitchenSinkFieldDef[];
}

const PARSED_DEFINITION = yamlParse(KITCHEN_SINK_TEMPLATE_YAML) as KitchenSinkTemplateDefinition;

if (!PARSED_DEFINITION || !Array.isArray(PARSED_DEFINITION.fields)) {
  throw new Error('Kitchen sink template YAML is malformed: expected a top-level `fields` array.');
}

// Cloned per call so callers can safely mutate the result (e.g. override the
// template name) without affecting the cached parse.
export function getKitchenSinkDefinition(): KitchenSinkTemplateDefinition {
  return JSON.parse(JSON.stringify(PARSED_DEFINITION));
}

// Flat list of fields used downstream by buildExtendedFields when a case is
// linked to the kitchen-sink template.
export const KITCHEN_SINK_FIELD_DEFS: readonly KitchenSinkFieldDef[] = PARSED_DEFINITION.fields;

const SAMPLE_TEXT_FALLBACKS = [
  'Investigation pending triage',
  'Awaiting customer confirmation',
  'Reproducible in staging only',
  'Suspected configuration drift',
  'No customer impact observed',
];

const SAMPLE_DB_CONNECTIONS = [
  'postgres://example:5432/orders',
  'mysql://example:3306/inventory',
  'mongodb://example:27017/auditlog',
];

const SAMPLE_AUTH_DETAILS = [
  'OAuth2 provider with refresh tokens',
  'SAML federated identity with SCIM provisioning',
  'API key + IP allowlist',
];

// Returns the extended_fields value for one kitchen-sink field, preferring
// the field's metadata.default and falling back to type/control-specific
// sampling that satisfies any declared validation rules. Output is always a
// string so it slots into extended_fields, which is a Record<string,string>.
// Called by buildKitchenSinkExtendedFields once per case field.

function sampleValueForField(field: KitchenSinkFieldDef): string {
  const defaultValue = field.metadata?.default;
  const options = field.metadata?.options;

  // CHECKBOX_GROUP serializes the picked option list as a JSON string so the
  // value still fits the keyword schema while preserving multiplicity.
  if (field.control === 'CHECKBOX_GROUP') {
    if (Array.isArray(defaultValue)) {
      return JSON.stringify(defaultValue);
    }
    if (options && options.length > 0) {
      const pickedCount = Math.max(1, Math.floor(rng() * options.length));
      return JSON.stringify(sampleN([...options], pickedCount));
    }
    return JSON.stringify([]);
  }

  // RADIO_GROUP / SELECT_BASIC: prefer the declared default, otherwise pick
  // one of the options uniformly.
  if (options && options.length > 0) {
    if (typeof defaultValue === 'string') return defaultValue;
    return pick([...options]);
  }

  if (defaultValue !== undefined && defaultValue !== null) {
    return String(defaultValue);
  }

  if (field.type === 'integer') {
    const min = field.validation?.min ?? 0;
    const max = field.validation?.max ?? 100;
    const span = Math.max(1, max - min);
    return String(min + Math.floor(rng() * span));
  }

  if (field.type === 'date') {
    return new Date().toISOString();
  }

  // Keyword fallback. A couple of fields have semantics we can sample more
  // realistically; everything else gets a generic capitalized sentence,
  // which already satisfies the only regex constraint the YAML declares
  // (`^[A-Z]` on `urgency_reason`).
  if (field.name === 'db_connection') {
    return pick(SAMPLE_DB_CONNECTIONS);
  }
  if (field.name === 'auth_details') {
    return pick(SAMPLE_AUTH_DETAILS);
  }
  return pick([...SAMPLE_TEXT_FALLBACKS]);
}

// Builds the extended_fields payload for a case linked to the kitchen-sink
// template. Keys are formed as `<name>_as_<type>` to match the cases server's
// extended_fields contract (see common/constants — CASE_EXTENDED_FIELDS).
// Called by data_generation.ts buildCaseRequest when the case's template
// carries kitchenSinkFields.
export function buildKitchenSinkExtendedFields(
  fields: readonly KitchenSinkFieldDef[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    const key = `${field.name}_as_${field.type}`;
    result[key] = sampleValueForField(field);
  }
  return result;
}
