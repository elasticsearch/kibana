/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonEmpty } from '@elastic/eui';
import { CompareMetricNodesLink, type NodeTypeForLink } from './metrics_node_details_link';

interface AnalyzeMetricsButtonProps {
  ids: string[];
  nodeType: NodeTypeForLink;
  timerange: { from: string; to: string };
  isOtel?: boolean;
  metricsIndices?: string;
}

export const AnalyzeMetricButton = ({
  ids,
  nodeType,
  timerange,
  metricsIndices,
}: AnalyzeMetricsButtonProps) => {
  return (
    <EuiButtonEmpty
      iconType="discoverApp"
      data-test-subj="analyzeMetricButton"
      onClick={
        CompareMetricNodesLink({
          ids,
          nodeType,
          timerange,
          metricsIndices,
        }).onClick
      }
    >
      {i18n.translate('xpack.metricsData.analyzeMetricButton.analyzeMetricButtonLabel', {
        defaultMessage: 'Compare metrics in Discover',
      })}
    </EuiButtonEmpty>
  );
};
