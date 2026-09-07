/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validFields, type ValidReadAuthEditFields } from '@kbn/alerting-plugin/common/constants';

/**
 * Authorization context for detection rule operations.
 * Contains boolean flags indicating what actions the current user is permitted to perform.
 *
 * Some fields (e.g. exceptions_list, investigation_fields, note) can be edited with just read
 * rule permissions if the user has the corresponding field-specific permission.
 */
export interface DetectionRulesAuthz {
  /** Whether the user can view detection rules */
  canReadRules: boolean;

  /** Whether the user can create, update, or delete detection rules */
  canEditRules: boolean;

  /** Whether the user can view exception lists */
  canReadExceptions: boolean;

  /** Whether the user can modify exception lists on rules */
  canEditExceptions: boolean;

  /** Whether the user can enable or disable detection rules */
  canEnableDisableRules: boolean;

  /** Whether the user can trigger manual runs (schedule backfill / fill gaps) for detection rules */
  canManualRunRules: boolean;

  /** Whether the user can modify investigation_fields on rules */
  canEditCustomHighlightedFields: boolean;

  /** Whether the user can modify the investigation guide (note) on rules */
  canEditInvestigationGuides: boolean;

  /** Whether the user can access rules management settings (e.g. gap autofill scheduler) */
  canAccessRulesManagementSettings: boolean;
}

/**
 * Rule params that can be edited with read rule permissions when the user holds the
 * matching sub-feature privilege, each mapped to the capability that authorizes it.
 * `param` is the rule-params key, `field` is the snake_case name used in API payloads
 * and authorization error messages. Shared by the Detection Engine field-write gate
 * and the alerting params authorizer so both endpoints enforce the same rules.
 * `enabled` is not included: it is a top-level rule attribute rather than a param.
 */
export const READ_AUTH_PARAM_FIELDS = [
  {
    field: 'exceptions_list',
    param: validFields.EXCEPTIONS_LIST,
    capability: 'canEditExceptions',
  },
  {
    field: 'investigation_fields',
    param: validFields.INVESTIGATION_FIELDS,
    capability: 'canEditCustomHighlightedFields',
  },
  { field: 'note', param: validFields.NOTE, capability: 'canEditInvestigationGuides' },
] as const satisfies ReadonlyArray<{
  field: string;
  param: ValidReadAuthEditFields;
  capability: keyof DetectionRulesAuthz;
}>;
