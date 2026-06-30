/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Plugins that must simply be present for significant events to work. The
 * values match `StreamsServer` plugin contract keys (enforced server-side).
 * To require a new plugin, add its name here.
 *
 * Note: workflowsManagement requires workflowsExtensions, so the latter is
 * technically covered, but both are listed explicitly to stay correct if that
 * relationship changes.
 */
export const SIGNIFICANT_EVENTS_REQUIRED_PLUGINS = [
  'workflowsExtensions',
  'workflowsManagement',
  'searchInferenceEndpoints',
  'agentBuilder',
] as const;

export type SignificantEventsRequiredPlugin = (typeof SIGNIFICANT_EVENTS_REQUIRED_PLUGINS)[number];

/**
 * Identifies the first significant events requirement that is not met. The UI
 * uses it to show a tailored message on why significant events is unavailable.
 *
 * `feature_flag` is the outermost gate (the significant events Technical Preview
 * flag); it is listed first to match the evaluation order on the server.
 */
export type SignificantEventsUnavailableReason =
  | 'feature_flag'
  | 'pricing_tier'
  | 'license'
  | 'ui_setting'
  | SignificantEventsRequiredPlugin;

export type SignificantEventsAvailabilityResponse =
  | { available: true }
  | { available: false; reason: SignificantEventsUnavailableReason };
