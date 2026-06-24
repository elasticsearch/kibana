/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { AlertEpisodeSeverityBadge } from './episode_severity_badge';

describe('AlertEpisodeSeverityBadge', () => {
  it('renders a badge for supported severity values', () => {
    render(
      <I18nProvider>
        <AlertEpisodeSeverityBadge severity="high" />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityBadge-high')).toHaveTextContent('High');
  });

  it('normalizes mixed-case severity values', () => {
    render(
      <I18nProvider>
        <AlertEpisodeSeverityBadge severity="CRITICAL" />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityBadge-critical')).toHaveTextContent(
      'Critical'
    );
  });

  it('renders nothing for unsupported severity values', () => {
    const { container } = render(
      <I18nProvider>
        <AlertEpisodeSeverityBadge severity="SEV1" />
      </I18nProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when severity is missing', () => {
    const { container } = render(
      <I18nProvider>
        <AlertEpisodeSeverityBadge severity={undefined} />
      </I18nProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
