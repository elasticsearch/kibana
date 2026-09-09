/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { getShortTimeStamp, parseTimestamp } from '../../../../../../common/utils/date_util';

export const CREATED_COLUMN_LABEL = i18n.translate(
  'xpack.synthetics.monitorList.createdColumnLabel',
  {
    defaultMessage: 'Created',
  }
);

export const LAST_MODIFIED_COLUMN_LABEL = i18n.translate(
  'xpack.synthetics.monitorList.lastModified',
  {
    defaultMessage: 'Last modified',
  }
);

export const MonitorTimestamp = ({
  timestamp,
  absolute = false,
}: {
  timestamp?: string;
  absolute?: boolean;
}) => {
  if (!timestamp) {
    return (
      <EuiText size="xs" color="subdued">
        {UNAVAILABLE_LABEL}
      </EuiText>
    );
  }

  const momentTs = parseTimestamp(timestamp);
  const relative = momentTs.fromNow();
  const formatted = getShortTimeStamp(momentTs);
  const primary = absolute ? formatted : relative;
  const secondary = absolute ? relative : formatted;

  return (
    <EuiToolTip content={secondary}>
      <EuiText
        tabIndex={0}
        size="xs"
        className="eui-textNoWrap"
        data-test-subj="syntheticsMonitorTimestamp"
      >
        <time dateTime={timestamp}>{primary}</time>
      </EuiText>
    </EuiToolTip>
  );
};

const UNAVAILABLE_LABEL = i18n.translate('xpack.synthetics.monitorList.timestampUnavailableLabel', {
  defaultMessage: '—',
});
