/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText, EuiToolTip } from '@elastic/eui';
import { truncatedAnchorCss } from './constants';

interface AnomalyJobNameProps {
  jobId: string;
  jobName: string;
  timeRange: { from: string; to: string };
}

export const AnomalyJobName: React.FC<AnomalyJobNameProps> = ({ jobName }) => {
  // TODO: Link to single metric viewer page
  return (
    <EuiToolTip content={jobName} anchorProps={{ css: truncatedAnchorCss }}>
      <EuiText tabIndex={0} size="xs" component="span">
        {jobName}
      </EuiText>
    </EuiToolTip>
  );
};
