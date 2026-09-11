/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useMemo } from 'react';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import type { TimeRangeMetadata } from '../../../common/time_range_metadata';
import { mockApmApiCallResponse } from '../../services/rest/storybook_mock_http';

const DEFAULTS = {
  isUsingServiceDestinationMetrics: true,
  sources: [
    {
      documentType: ApmDocumentType.ServiceTransactionMetric,
      hasDocs: true,
      rollupInterval: RollupInterval.OneMinute,
      hasDurationSummaryField: true,
    },
    {
      documentType: ApmDocumentType.TransactionMetric,
      hasDocs: true,
      rollupInterval: RollupInterval.OneMinute,
      hasDurationSummaryField: true,
    },
    {
      documentType: ApmDocumentType.TransactionEvent,
      hasDocs: true,
      rollupInterval: RollupInterval.None,
      hasDurationSummaryField: false,
    },
    {
      documentType: ApmDocumentType.ServiceDestinationMetric,
      hasDocs: true,
      rollupInterval: RollupInterval.None,
      hasDurationSummaryField: false,
    },
  ],
};

export function MockTimeRangeContextProvider({
  children,
  metadata,
}: {
  children?: React.ReactNode;
  metadata?: TimeRangeMetadata;
}) {
  useMemo(() => {
    mockApmApiCallResponse('GET /internal/apm/time_range_metadata', () => {
      return metadata ?? DEFAULTS;
    });
  }, [metadata]);

  return <>{children}</>;
}
