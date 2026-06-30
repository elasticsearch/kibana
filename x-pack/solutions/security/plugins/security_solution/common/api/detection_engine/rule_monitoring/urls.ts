/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { INTERNAL_DETECTION_ENGINE_URL as INTERNAL_URL } from '../../../constants';

// -------------------------------------------------------------------------------------------------
// Detection Engine health API

/**
 * Get health overview of the whole cluster. Scope: all detection rules in all Kibana spaces.
 * See the corresponding route handler for more details.
 */
export const GET_CLUSTER_HEALTH_URL = `${INTERNAL_URL}/health/_cluster` as const;

/**
 * Get health overview of the current Kibana space. Scope: all detection rules in the space.
 * See the corresponding route handler for more details.
 */
export const GET_SPACE_HEALTH_URL = `${INTERNAL_URL}/health/_space` as const;

/**
 * Get health overview of a rule. Scope: a given detection rule in the current Kibana space.
 * See the corresponding route handler for more details.
 */
export const GET_RULE_HEALTH_URL = `${INTERNAL_URL}/health/_rule` as const;

// -------------------------------------------------------------------------------------------------
// Rule execution logs API

export const READ_RULE_EXECUTION_RESULTS_URL =
  `${INTERNAL_URL}/rules/{ruleId}/execution/results` as const;
export const readRuleExecutionResultsUrl = (ruleId: string) =>
  `${INTERNAL_URL}/rules/${ruleId}/execution/results` as const;

// -------------------------------------------------------------------------------------------------
// Rule execution logs API (v2 — RnA / Alerting v2)

export const READ_V2_RULE_EXECUTION_RESULTS_URL =
  `${INTERNAL_URL}/rules_v2/{ruleId}/execution/results` as const;
export const readV2RuleExecutionResultsUrl = (ruleId: string) =>
  `${INTERNAL_URL}/rules_v2/${ruleId}/execution/results` as const;
