/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnomalyDetectorType } from '@kbn/apm-types';
import { AnomaliesBadge } from './anomalies_badge';

async function getTooltipText(): Promise<string | null | undefined> {
  const anchor = document.querySelector('.euiToolTipAnchor');
  expect(anchor).not.toBeNull();
  fireEvent.mouseOver(anchor!);

  await waitFor(() => {
    expect(document.querySelector('.euiToolTipPopover')).not.toBeNull();
  });

  return document.querySelector('.euiToolTipPopover')?.textContent;
}

describe('AnomaliesBadge', () => {
  it('names the anomalous detector in the tooltip when a detectorType is provided', async () => {
    render(<AnomaliesBadge score={82} detectorType={AnomalyDetectorType.txFailureRate} />);

    expect(await getTooltipText()).toBe('Anomaly score (max.): 82.00 - Failed transaction rate');
  });

  it('falls back to a score-only tooltip when no detectorType is provided', async () => {
    render(<AnomaliesBadge score={82} />);

    expect(await getTooltipText()).toBe('Anomaly score (max.): 82.00');
  });

  it('shows the unknown tooltip when no score is available', async () => {
    render(<AnomaliesBadge detectorType={AnomalyDetectorType.txLatency} />);

    expect(await getTooltipText()).toBe(
      'No anomaly score is available for the selected time range.'
    );
  });

  it('renders the badge as a link when an href is provided', () => {
    render(
      <AnomaliesBadge score={82} detectorType={AnomalyDetectorType.txLatency} href="/some/url" />
    );

    expect(screen.getByTestId('apmAnomaliesBadge').closest('a')).toHaveAttribute(
      'href',
      '/some/url'
    );
  });
});
