/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSkeletonRectangle, EuiSkeletonText, EuiSpacer } from '@elastic/eui';
import type { ElasticAgentVersionInfo } from '../../../../../common/types';
import { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { CommandSnippet } from '../command_snippet';
import { type IngestionMode } from '../../shared/wired_streams_ingestion_selector';

export interface KubernetesFlowData {
  apiKeyEncoded: string;
  onboardingId: string;
  elasticsearchUrl: string;
  elasticAgentVersionInfo: ElasticAgentVersionInfo;
}

export interface KubernetesElasticAgentInstallStepProps {
  status: FETCH_STATUS;
  data?: KubernetesFlowData;
  isMonitoringStepActive: boolean;
  ingestionMode: IngestionMode;
  onIngestionModeChange: (mode: IngestionMode) => void;
  useInlineCopyOnly?: boolean;
  useColoredSyntax?: boolean;
}

export const KubernetesElasticAgentInstallStep: React.FC<
  KubernetesElasticAgentInstallStepProps
> = ({
  status,
  data,
  isMonitoringStepActive,
  ingestionMode,
  onIngestionModeChange,
  useInlineCopyOnly = false,
  useColoredSyntax = false,
}) => {
  return (
    <>
      {status !== FETCH_STATUS.SUCCESS && (
        <>
          <EuiSkeletonText lines={5} />
          <EuiSpacer />
          <EuiSkeletonRectangle width="170px" height="40px" />
        </>
      )}
      {status === FETCH_STATUS.SUCCESS && data !== undefined && (
        <CommandSnippet
          encodedApiKey={data.apiKeyEncoded}
          onboardingId={data.onboardingId}
          elasticsearchUrl={data.elasticsearchUrl}
          elasticAgentVersionInfo={data.elasticAgentVersionInfo}
          isCopyPrimaryAction={!isMonitoringStepActive}
          ingestionMode={ingestionMode}
          onIngestionModeChange={onIngestionModeChange}
          useInlineCopyOnly={useInlineCopyOnly}
          useColoredSyntax={useColoredSyntax}
        />
      )}
    </>
  );
};
