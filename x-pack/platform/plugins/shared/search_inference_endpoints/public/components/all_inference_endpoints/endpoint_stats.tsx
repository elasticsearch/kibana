/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText, EuiTextColor } from '@elastic/eui';
import type { InferenceInferenceEndpointInfo } from '@elastic/elasticsearch/lib/api/types';
import { i18n } from '@kbn/i18n';
import { getModelId } from '../../utils/get_model_id';
import { StatItemStyles } from './styles';

interface EndpointStatsProps {
  endpoints: InferenceInferenceEndpointInfo[];
}

interface StatItemProps {
  label: string;
  count: number;
  testSubj: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, count, testSubj }) => (
  <EuiText size="s">
    <EuiTextColor color="subdued">{label}</EuiTextColor>&nbsp;
    <strong>
      <span data-test-subj={testSubj}>{count}</span>
    </strong>
  </EuiText>
);

export const EndpointStats: React.FC<EndpointStatsProps> = ({ endpoints }) => {
  const stats = useMemo(() => {
    const models = new Set<string>();

    endpoints.forEach((endpoint) => {
      const modelId = getModelId(endpoint);
      if (modelId) {
        models.add(modelId);
      }
    });

    return {
      modelsCount: models.size,
      endpointsCount: endpoints.length,
    };
  }, [endpoints]);

  const statItems: StatItemProps[] = [
    {
      label: i18n.translate('xpack.searchInferenceEndpoints.endpointStats.modelsLabel', {
        defaultMessage: 'Models:',
      }),
      count: stats.modelsCount,
      testSubj: 'endpointStatsModelsCount',
    },
    {
      label: i18n.translate('xpack.searchInferenceEndpoints.endpointStats.endpointsLabel', {
        defaultMessage: 'Endpoints:',
      }),
      count: stats.endpointsCount,
      testSubj: 'endpointStatsEndpointsCount',
    },
  ];

  return (
    <EuiFlexGroup
      gutterSize="m"
      alignItems="center"
      responsive={false}
      data-test-subj="endpointStats"
    >
      {statItems.map((item, index) => (
        <EuiFlexItem key={`stat-${index}`} grow={false} css={StatItemStyles}>
          <StatItem label={item.label} count={item.count} testSubj={item.testSubj} />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};
