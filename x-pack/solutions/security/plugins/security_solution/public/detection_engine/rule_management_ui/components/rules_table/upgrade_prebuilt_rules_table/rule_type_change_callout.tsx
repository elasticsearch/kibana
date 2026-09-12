/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import {
  RULE_TYPE_CHANGE_CALLOUT_DESCRIPTION,
  RULE_TYPE_CHANGE_CALLOUT_TITLE,
  RULE_TYPE_CHANGE_WITH_CUSTOMIZATIONS_CALLOUT_DESCRIPTION,
} from './translations';

interface RuleTypeChangeCalloutProps {
  hasCustomizations: boolean;
}

export function RuleTypeChangeCallout({
  hasCustomizations,
}: RuleTypeChangeCalloutProps): JSX.Element {
  return (
    <EuiCallOut
      title={RULE_TYPE_CHANGE_CALLOUT_TITLE}
      color={hasCustomizations ? 'danger' : 'warning'}
      iconType="warning"
    >
      <p>
        {hasCustomizations
          ? RULE_TYPE_CHANGE_WITH_CUSTOMIZATIONS_CALLOUT_DESCRIPTION
          : RULE_TYPE_CHANGE_CALLOUT_DESCRIPTION}
      </p>
    </EuiCallOut>
  );
}
