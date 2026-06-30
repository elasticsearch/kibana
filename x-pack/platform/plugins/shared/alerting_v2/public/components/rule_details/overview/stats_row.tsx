/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiStat } from '@elastic/eui';

export interface StatItem {
  /** The large headline value (already formatted). */
  title: string;
  /** The label rendered beneath the value. */
  description: string;
  dataTestSubj: string;
}

export interface StatsRowProps {
  stats: StatItem[];
  ['data-test-subj']?: string;
}

/**
 * Presentational KPI row: evenly distributed {@link EuiStat} cards. Holds no
 * data-shape opinion so it can back both the episode overview (lifecycle
 * metrics) and the signal overview (firing metrics).
 */
export const StatsRow: React.FC<StatsRowProps> = ({ stats, ['data-test-subj']: dataTestSubj }) => {
  return (
    <EuiFlexGroup justifyContent="spaceBetween" responsive={false} data-test-subj={dataTestSubj}>
      {stats.map((stat) => (
        <EuiFlexItem key={stat.dataTestSubj}>
          <EuiStat
            title={stat.title}
            description={stat.description}
            reverse
            titleSize="m"
            textAlign="left"
            data-test-subj={stat.dataTestSubj}
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};
