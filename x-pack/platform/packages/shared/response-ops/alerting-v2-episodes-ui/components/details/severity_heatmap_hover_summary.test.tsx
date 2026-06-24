/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SeverityHeatmapHoverSummary } from './severity_heatmap_hover_summary';

describe('SeverityHeatmapHoverSummary', () => {
  it('renders severity label and click hint', () => {
    render(
      <SeverityHeatmapHoverSummary severityLabel="High" timestamp="Jan 1, 2024, 12:00:00 AM" />
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityHeatmapHoverSummary')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2024, 12:00:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Click to see data')).toBeInTheDocument();
  });
});
