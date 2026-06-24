/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import { AlertEpisodeDetailsHeader } from './details_header';

describe('AlertEpisodeDetailsHeader', () => {
  it('renders title, description, status badges, and tags', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          title="Rule 1"
          description="Some description"
          tags={['t1']}
          status={ALERT_EPISODE_STATUS.ACTIVE}
          severity={undefined}
          episodeAction={undefined}
          groupAction={undefined}
        />
      </I18nProvider>
    );
    expect(screen.getByRole('heading', { name: 'Rule 1' })).toBeInTheDocument();
    expect(screen.getByText('Some description')).toBeInTheDocument();
    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderTags')).toBeInTheDocument();
    expect(screen.getByText('t1')).toBeInTheDocument();
  });

  it('renders the loading title fallback when title is undefined', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          title={undefined}
          description={undefined}
          tags={[]}
          status={undefined}
          severity={undefined}
          episodeAction={undefined}
          groupAction={undefined}
        />
      </I18nProvider>
    );
    expect(screen.getByTestId('alertingV2EpisodeDetailsHeaderLoadingTitle')).toBeInTheDocument();
  });

  it('renders the severity badge after the status badge', () => {
    render(
      <I18nProvider>
        <AlertEpisodeDetailsHeader
          title="Rule 1"
          description={undefined}
          tags={[]}
          status={ALERT_EPISODE_STATUS.ACTIVE}
          severity="high"
          episodeAction={undefined}
          groupAction={undefined}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('alertingV2EpisodeSeverityBadge-high')).toHaveTextContent('High');
  });
});
