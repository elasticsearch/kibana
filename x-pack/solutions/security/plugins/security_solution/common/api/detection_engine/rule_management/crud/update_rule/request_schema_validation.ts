/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateThresholdBase } from '../../../../../utils/request_validation/threshold';
import { validateThreatMapping } from '../../../../../utils/request_validation/indicator_match';
import { validateRuleScheduleWithDefaults } from '../../../../../utils/request_validation/rule_schedule';
import type { RuleUpdateProps } from '../../../model';

/**
 * Additional validation that is implemented outside of the schema itself.
 */
export const validateUpdateRuleProps = (props: RuleUpdateProps): string[] => {
  return [
    ...validateId(props),
    ...validateTimelineId(props),
    ...validateTimelineTitle(props),
    ...validateThreshold(props),
    ...validateThreatMapping(props),
    ...validateRuleScheduleWithDefaults(props),
  ];
};

const validateId = (props: RuleUpdateProps): string[] => {
  if (props.id != null && props.rule_id != null) {
    return ['both "id" and "rule_id" cannot exist, choose one or the other'];
  } else if (props.id == null && props.rule_id == null) {
    return ['either "id" or "rule_id" must be set'];
  } else {
    return [];
  }
};

const validateTimelineId = (props: RuleUpdateProps): string[] => {
  if (props.timeline_id != null) {
    if (props.timeline_title == null) {
      return ['when "timeline_id" exists, "timeline_title" must also exist'];
    } else if (props.timeline_id === '') {
      return ['"timeline_id" cannot be an empty string'];
    } else {
      return [];
    }
  }
  return [];
};

const validateTimelineTitle = (props: RuleUpdateProps): string[] => {
  if (props.timeline_title != null) {
    if (props.timeline_id == null) {
      return ['when "timeline_title" exists, "timeline_id" must also exist'];
    } else if (props.timeline_title === '') {
      return ['"timeline_title" cannot be an empty string'];
    } else {
      return [];
    }
  }
  return [];
};

const validateThreshold = (props: RuleUpdateProps): string[] => validateThresholdBase(props);
