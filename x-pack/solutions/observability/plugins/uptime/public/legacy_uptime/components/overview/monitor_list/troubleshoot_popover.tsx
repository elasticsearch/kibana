/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiText,
  EuiPopoverTitle,
  EuiPopover,
  EuiPopoverFooter,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { useSelector } from 'react-redux';
import { FormattedMessage } from '@kbn/i18n-react';

import { selectPingHistogram } from '../../../state/selectors';
import { useUrlParams } from '../../../hooks';

export const TroubleshootPopover = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => setIsPopoverOpen((prevState) => !prevState);
  const closePopover = () => setIsPopoverOpen(false);

  const { pingHistogram } = useSelector(selectPingHistogram);

  const updatedUrlParams = useUrlParams()[1];
  const troubleshootPopoverTitleId = useGeneratedHtmlId();

  const histogram = pingHistogram?.histogram ?? [];

  const middleBucketTimestamp = histogram?.[Math.floor(histogram.length / 2)].x;
  const firstBucketTimestamp = histogram?.[0].x;

  return (
    <EuiPopover
      aria-labelledby={troubleshootPopoverTitleId}
      button={
        <EuiButtonEmpty
          data-test-subj="syntheticsTroubleshootPopoverButton"
          onClick={onButtonClick}
        >
          {WHERE_ARE_MY_MONITORS}
        </EuiButtonEmpty>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      anchorPosition="upCenter"
    >
      <EuiPopoverTitle id={troubleshootPopoverTitleId}>{SYSTEM_CLOCK_OUT_OF_SYNC}</EuiPopoverTitle>
      <div style={{ width: '300px' }}>
        <EuiText size="s">
          <p>
            <FormattedMessage
              id="xpack.uptime.monitorList.noMessage.troubleshoot"
              defaultMessage="Try using an absolute date range. If monitors appears afterwards,
              there may be an issue with the system clock where Heartbeat or Kibana is installed."
            />
          </p>
        </EuiText>
      </div>
      <EuiPopoverFooter>
        <EuiButton
          data-test-subj="syntheticsTroubleshootPopoverButton"
          fullWidth
          iconType="calendar"
          size="s"
          onClick={() => {
            if (middleBucketTimestamp && firstBucketTimestamp) {
              updatedUrlParams({
                dateRangeStart: new Date(firstBucketTimestamp).toISOString(),
                dateRangeEnd: new Date(middleBucketTimestamp).toISOString(),
              });
            }
          }}
        >
          {APPLY_ABSOLUTE_DATE_RANGE}
        </EuiButton>
      </EuiPopoverFooter>
    </EuiPopover>
  );
};

export const APPLY_ABSOLUTE_DATE_RANGE = i18n.translate(
  'xpack.uptime.monitorList.troubleshoot.tryDateRange',
  {
    defaultMessage: 'Apply absolute date range',
  }
);

export const WHERE_ARE_MY_MONITORS = i18n.translate(
  'xpack.uptime.monitorList.troubleshoot.whereAreMyMonitors',
  {
    defaultMessage: 'Where are my monitors?',
  }
);

export const SYSTEM_CLOCK_OUT_OF_SYNC = i18n.translate(
  'xpack.uptime.monitorList.troubleshoot.systemClockOutOfSync',
  {
    defaultMessage: 'System clock may be out of sync',
  }
);
