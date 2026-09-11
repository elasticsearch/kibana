/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateThresholdBase } from '../../../../../utils/request_validation/threshold';
import { validateThreatMapping } from '../../../../../utils/request_validation/indicator_match';
import { validateRuleSchedule } from '../../../../../utils/request_validation/rule_schedule';
import type { PatchRuleRequestBody } from './patch_rule_route.gen';

/**
 * Additional validation that is implemented outside of the schema itself.
 */
export const validatePatchRuleRequestBody = (rule: PatchRuleRequestBody): string[] => {
  // Complete schedules are checked here. Partial schedules are checked after they are merged with
  // the existing rule in applyRulePatch.
  return [
    ...validateId(rule),
    ...validateTimelineId(rule),
    ...validateTimelineTitle(rule),
    ...validateThreshold(rule),
    ...validateThreatMapping(rule),
    ...validateRuleSchedule(rule),
  ];
};

const validateId = (rule: PatchRuleRequestBody): string[] => {
  if (rule.id != null && rule.rule_id != null) {
    return ['both "id" and "rule_id" cannot exist, choose one or the other'];
  } else if (rule.id == null && rule.rule_id == null) {
    return ['either "id" or "rule_id" must be set'];
  } else {
    return [];
  }
};

const validateTimelineId = (rule: PatchRuleRequestBody): string[] => {
  if (rule.timeline_id != null) {
    if (rule.timeline_title == null) {
      return ['when "timeline_id" exists, "timeline_title" must also exist'];
    } else if (rule.timeline_id === '') {
      return ['"timeline_id" cannot be an empty string'];
    } else {
      return [];
    }
  }
  return [];
};

const validateTimelineTitle = (rule: PatchRuleRequestBody): string[] => {
  if (rule.timeline_title != null) {
    if (rule.timeline_id == null) {
      return ['when "timeline_title" exists, "timeline_id" must also exist'];
    } else if (rule.timeline_title === '') {
      return ['"timeline_title" cannot be an empty string'];
    } else {
      return [];
    }
  }
  return [];
};

const validateThreshold = (rule: PatchRuleRequestBody): string[] => validateThresholdBase(rule);
