/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiText, EuiToolTip } from '@elastic/eui';
import { PreferenceFormattedDate } from '../../../../common/components/formatted_date';

const tooltipAnchorCss = css`
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
`;

interface AnomalyTimestampProps {
  timestamp: string | number;
}

export const AnomalyTimestamp: React.FC<AnomalyTimestampProps> = ({ timestamp }) => {
  return (
    <EuiToolTip
      content={<PreferenceFormattedDate value={new Date(timestamp)} />}
      anchorProps={{ css: tooltipAnchorCss }}
    >
      <EuiText size="xs" component="span" tabIndex={0}>
        <PreferenceFormattedDate value={new Date(timestamp)} />
      </EuiText>
    </EuiToolTip>
  );
};
