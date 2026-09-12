/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import {
  DEFAULT_BUCKET_MINUTES,
  DEFAULT_WINDOW_HOURS,
  useProposalChartsSummary,
} from '../../hooks/use_proposal_charts_summary';
import { CHARTS_SUMMARY_PANELS } from './constants';
import { ProposalChartsSummaryCard } from './proposal_charts_summary_card';

interface ProposalChartsSummaryRowProps {
  windowHours?: number;
  bucketMinutes?: number;
}

export const ProposalChartsSummaryRow: React.FC<ProposalChartsSummaryRowProps> = ({
  windowHours = DEFAULT_WINDOW_HOURS,
  bucketMinutes = DEFAULT_BUCKET_MINUTES,
}) => {
  const { data, isLoading, error } = useProposalChartsSummary({ windowHours, bucketMinutes });

  // Hide rather than error out: the queue below is the primary surface. Gated on
  // `!data` so keepPreviousData keeps the cards up through a transient refetch failure.
  if (error && !data) {
    return null;
  }

  const buckets = data?.buckets ?? [];
  const lastBucket = buckets[buckets.length - 1];

  return (
    <EuiFlexGroup
      gutterSize="m"
      responsive={false}
      data-test-subj="alertZeroProposalChartsSummaryRow"
    >
      {CHARTS_SUMMARY_PANELS.map(({ id, category, label, color }) => {
        const series = buckets.map((b) => ({
          x: b.timestamp,
          y: b.counts[category] ?? 0,
        }));
        const count = lastBucket?.counts[category] ?? 0;

        return (
          <EuiFlexItem key={id}>
            <ProposalChartsSummaryCard
              id={id}
              label={label}
              color={color}
              count={count}
              series={series}
              isLoading={isLoading}
              windowHours={windowHours}
              bucketMinutes={bucketMinutes}
            />
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );
};
