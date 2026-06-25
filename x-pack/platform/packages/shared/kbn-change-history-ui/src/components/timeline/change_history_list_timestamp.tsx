/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { FormattedDate, FormattedTime } from '@kbn/i18n-react';

export interface ChangeHistoryListTimestampProps {
  value: Date;
  withSeconds?: boolean;
}

export const ChangeHistoryListTimestamp = memo(function ChangeHistoryListTimestamp({
  value,
  withSeconds = false,
}: ChangeHistoryListTimestampProps): JSX.Element {
  return (
    <>
      <FormattedDate value={value} year="numeric" month="short" day="numeric" />
      {' @ '}
      <FormattedTime
        value={value}
        hour="numeric"
        minute="2-digit"
        {...(withSeconds ? { second: '2-digit' } : {})}
      />
    </>
  );
});
