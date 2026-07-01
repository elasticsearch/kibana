/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StabilityLevel } from '@kbn/workflows';
import type { z } from '@kbn/zod/v4';

/**
 * Documentation for a trigger (aligned with steps: details + examples).
 */
export interface TriggerDocumentation {
  /**
   * Detailed description with usage examples (markdown supported)
   */
  details?: string;
  /**
   * Usage examples as markdown strings (e.g. "## Title\n```yaml\n...").
   */
  examples?: string[];
}

/**
 * Pre-filled snippet values when the user adds this trigger from the UI.
 */
export interface TriggerSnippets {
  /**
   * KQL condition pre-filled in the trigger's `on.condition` when the user adds this
   * trigger from the UI (actions menu or YAML autocomplete).
   * Must be valid KQL and only reference properties from the event schema (validated at registration).
   */
  condition?: string;
}

/**
 * Shared trigger contract (common to server and public).
 *
 * Constraints (enforced at registration):
 * - id: globally unique, namespaced format <solution>.<event>
 * - eventSchema: must be a Zod object schema that rejects unknown fields
 *
 * Server and agent tooling read title and description from here; documentation and snippets are optional.
 * Public definitions spread this object and add UI-only fields (e.g. icon).
 */
export interface CommonTriggerDefinition<EventSchema extends z.ZodType = z.ZodType> {
  /** Globally unique, namespaced identifier (e.g. cases.updated, alerts.recovered) */
  id: string;
  /**
   * Payload contract (Zod object schema; must reject unknown fields by default).
   * Adding descriptions to properties (e.g. with .describe()) is recommended so they will
   * help users to understand the data they will receive with the event.
   */
  eventSchema: EventSchema;
  /**
   * Short human-readable name for this trigger (UI and agent catalog label).
   */
  title: string;
  /**
   * User-facing description of when this trigger is emitted.
   */
  description: string;
  /**
   * Documentation (details + YAML examples), aligned with step definitions.
   */
  documentation?: TriggerDocumentation;
  /**
   * Pre-filled values for snippet insertion (e.g. on.condition).
   */
  snippets?: TriggerSnippets;
  /**
   * API stability level for this trigger (e.g. 'tech_preview', 'beta', 'stable').
   * Required so every trigger explicitly declares its contract. Set 'stable' for GA triggers (no badge).
   * Until event-driven triggers GA, registration accepts only 'tech_preview'.
   */
  stability: StabilityLevel;
}
