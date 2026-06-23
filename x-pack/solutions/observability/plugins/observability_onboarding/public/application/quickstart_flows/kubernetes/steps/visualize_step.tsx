/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { DataIngestStatus, type ActionLink } from '../data_ingest_status';

export interface KubernetesElasticAgentVisualizeStepProps {
  isMonitoringStepActive: boolean;
  data?: { onboardingId: string };
  actionLinks: ActionLink[];
  onDataReceived: () => void;
}

export const KubernetesElasticAgentVisualizeStep: React.FC<
  KubernetesElasticAgentVisualizeStepProps
> = ({ isMonitoringStepActive, data, actionLinks, onDataReceived }) => {
  if (!isMonitoringStepActive || !data) {
    return null;
  }

  return (
    <DataIngestStatus
      onboardingId={data.onboardingId}
      onboardingFlowType="kubernetes"
      dataset="kubernetes"
      integration="kubernetes"
      actionLinks={actionLinks}
      onDataReceived={onDataReceived}
    />
  );
};
