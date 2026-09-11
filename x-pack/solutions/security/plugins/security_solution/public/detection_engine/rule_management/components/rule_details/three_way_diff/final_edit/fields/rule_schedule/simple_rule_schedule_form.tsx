/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { TimeDuration, getTimeDurationUnit } from '@kbn/securitysolution-utils/time_duration';
import type {
  RuleSchedule,
  SimpleRuleSchedule,
} from '../../../../../../../../../common/api/detection_engine/model/rule_schema/rule_schedule';
import { toSimpleRuleSchedule } from '../../../../../../../../../common/api/detection_engine/model/rule_schema/to_simple_rule_schedule';
import { type FormData } from '../../../../../../../../shared_imports';
import type { DiffableRule } from '../../../../../../../../../common/api/detection_engine';
import { RuleFieldEditFormWrapper } from '../../../field_final_side';
import { SimpleRuleScheduleAdapter } from './simple_rule_schedule_adapter';
import { invariant } from '../../../../../../../../../common/utils/invariant';

export function SimpleRuleScheduleForm(): JSX.Element {
  return (
    <RuleFieldEditFormWrapper
      component={SimpleRuleScheduleAdapter}
      serializer={serializer}
      deserializer={deserializer}
    />
  );
}

function deserializer(_: unknown, finalRule: DiffableRule): Partial<SimpleRuleSchedule> {
  const simpleRuleSchedule = toSimpleRuleSchedule(finalRule.rule_schedule);

  invariant(simpleRuleSchedule, 'Unable to calculate simple rule schedule');

  return {
    interval: simpleRuleSchedule.interval,
    lookback: simpleRuleSchedule.lookback,
  };
}

function serializer(formData: FormData): {
  rule_schedule: RuleSchedule;
} {
  const interval = TimeDuration.parse(formData.interval);
  const lookBack = TimeDuration.parse(formData.lookback);

  invariant(interval !== undefined && interval.value > 0, 'Rule interval is invalid');
  invariant(lookBack !== undefined && lookBack.value >= 0, "Rule's look-back is invalid");

  // Use the raw unit entered by the user (not `lookBack.unit`, which is
  // normalized by `parse`) so the chosen format is preserved through `from`.
  const lookBackUnit = getTimeDurationUnit(formData.lookback);
  const fromOffsetMs = interval.toMilliseconds() + lookBack.toMilliseconds();
  const fromOffset = TimeDuration.fromMilliseconds(fromOffsetMs, lookBackUnit);

  const from = `now-${fromOffset}`;

  return {
    rule_schedule: {
      interval: formData.interval,
      from,
      to: 'now',
    },
  };
}
