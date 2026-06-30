/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiLink, EuiText, EuiToolTip } from '@elastic/eui';
import { useKibana } from '../../../../common/lib/kibana';
import { truncatedAnchorCss } from './constants';
import { useAnomalySingleMetricViewerUrl } from '../../../api/hooks/use_anomaly_single_metric_viewer_url';

interface AnomalyJobNameProps {
  jobId: string;
  jobName: string;
  recordId: string;
  timeRange: { from: string; to: string };
}

export const AnomalyJobName: React.FC<AnomalyJobNameProps> = ({
  jobId,
  jobName,
  recordId,
  timeRange,
}) => {
  const {
    services: { ml },
  } = useKibana();

  const getUrl = useAnomalySingleMetricViewerUrl(timeRange);

  const handleClick = useCallback(async () => {
    if (!getUrl || !ml?.mlApi) return;
    try {
      const result = await ml.mlApi.results.anomalySearch(
        { size: 1, query: { ids: { values: [recordId] } } },
        [jobId]
      );
      const record = result.hits.hits[0]?._source;
      if (!record) return;
      const url = await getUrl(record);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      // Failed to open anomaly in Single Metric Viewer
    }
  }, [getUrl, ml, jobId, recordId]);

  if (!getUrl) {
    return (
      <EuiToolTip content={jobName} anchorProps={{ css: truncatedAnchorCss }}>
        <EuiText tabIndex={0} size="xs" component="span">
          {jobName}
        </EuiText>
      </EuiToolTip>
    );
  }

  return (
    <EuiToolTip content={jobName} anchorProps={{ css: truncatedAnchorCss }}>
      <EuiLink css={truncatedAnchorCss} color="primary" onClick={handleClick}>
        {jobName}
      </EuiLink>
    </EuiToolTip>
  );
};
