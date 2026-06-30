/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FieldGroup } from './field_group';
import { ScheduleField } from '../fields/schedule_field';
import { LookbackWindowField } from '../fields/lookback_window_field';

export const RuleExecutionFieldGroup = () => {
  return (
    <FieldGroup
      title={i18n.translate('xpack.alertingV2.ruleForm.ruleExecution', {
        defaultMessage: 'Rule execution',
      })}
      defaultOpen
    >
      <ScheduleField />
      <LookbackWindowField />
    </FieldGroup>
  );
};
