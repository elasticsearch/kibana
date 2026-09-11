/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiText } from '@elastic/eui';
import React, { useMemo } from 'react';

import { useDateFormat } from '../../../common/lib/kibana';
import { getFormattedDate } from '../../pages/loading_callout/loading_messages/get_formatted_time';

import { DETECTED_ON_LABEL } from './translations';

export const ATTACK_DETECTED_ON_TEST_ID = 'attackDetectedOn';

/**
 * Formats an attack timestamp with the date format configured by the user.
 * Returns `null` when the timestamp is absent.
 */
export const useFormattedAttackTimestamp = (timestamp?: string): string | null => {
  const dateFormat = useDateFormat();

  return useMemo(() => getFormattedDate({ date: timestamp, dateFormat }), [dateFormat, timestamp]);
};

interface AttackDetectedOnProps {
  /** When the attack was detected, as an ISO 8601 date */
  timestamp?: string;
}

/**
 * Renders the `Detected on {timestamp}` line of an attack, and nothing when the
 * timestamp is absent or cannot be formatted.
 */
export const AttackDetectedOn = React.memo<AttackDetectedOnProps>(({ timestamp }) => {
  const formattedTimestamp = useFormattedAttackTimestamp(timestamp);

  if (formattedTimestamp == null || formattedTimestamp.length === 0) {
    return null;
  }

  return (
    <EuiText color="subdued" data-test-subj={ATTACK_DETECTED_ON_TEST_ID} size="xs">
      {DETECTED_ON_LABEL(formattedTimestamp)}
    </EuiText>
  );
});
AttackDetectedOn.displayName = 'AttackDetectedOn';
