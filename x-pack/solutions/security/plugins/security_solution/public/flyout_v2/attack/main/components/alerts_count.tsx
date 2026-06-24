/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { FlyoutHeaderBlock } from '../../../shared/components/flyout_header_block';
import { HEADER_ALERTS_BLOCK_TEST_ID } from '../constants/test_ids';

const FIELD_ALERT_IDS = 'kibana.alert.attack_discovery.alert_ids' as const;

export interface AlertsCountProps {
  /**
   * The attack document. The alert IDs are read from `hit.flattened`.
   */
  hit: DataTableRecord;
}

/**
 * Displays the number of alerts associated with the attack.
 * Reads alert IDs from `hit.flattened` (using the raw value because
 * `getFieldValue` only returns the first element of array fields).
 */
export const AlertsCount: FC<AlertsCountProps> = memo(({ hit }) => {
  const alertsCount = useMemo(() => {
    const value = hit.flattened[FIELD_ALERT_IDS];
    if (!value) return 0;
    if (Array.isArray(value)) return value.length;
    return 1;
  }, [hit]);

  return (
    <FlyoutHeaderBlock
      hasBorder
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.header.alertsTitle"
          defaultMessage="Alerts"
        />
      }
      data-test-subj={HEADER_ALERTS_BLOCK_TEST_ID}
    >
      {alertsCount}
    </FlyoutHeaderBlock>
  );
});

AlertsCount.displayName = 'AlertsCount';
