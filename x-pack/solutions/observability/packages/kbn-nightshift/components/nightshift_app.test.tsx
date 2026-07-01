/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import React from 'react';
import { NightshiftApp } from './nightshift_app';
import type { GapsReport } from './nightshift_app';

const mockGapsReport: GapsReport = {
  title: 'Knowledge gaps',
  updated_at: '2024-01-15T10:00:00Z',
  content: `# Knowledge gaps

## Highest priority

- **Deployment** — Rollout strategy is not documented.
- **Infrastructure** — Cluster ownership is unclear.`,
};

const renderNightshiftApp = (children: React.ReactElement) =>
  render(<I18nProvider>{children}</I18nProvider>);

describe('NightshiftApp', () => {
  describe('empty state', () => {
    it('renders the title', () => {
      renderNightshiftApp(<NightshiftApp />);
      expect(screen.getByText('Nightshift')).toBeInTheDocument();
    });

    it('shows the onboarding button when agentBuilder is available', () => {
      const onStartOnboarding = jest.fn();
      renderNightshiftApp(
        <NightshiftApp agentBuilderAvailable onStartOnboarding={onStartOnboarding} />
      );
      expect(screen.getByTestId('nightshiftStartOnboardingButton')).toBeInTheDocument();
    });

    it('keeps the onboarding button visible but disabled when agentBuilder is unavailable', () => {
      renderNightshiftApp(
        <NightshiftApp agentBuilderAvailable={false} onStartOnboarding={jest.fn()} />
      );
      expect(screen.getByTestId('nightshiftStartOnboardingButton')).toBeDisabled();
    });

    it('fires onStartOnboarding when the button is clicked', async () => {
      const onStartOnboarding = jest.fn();
      renderNightshiftApp(
        <NightshiftApp agentBuilderAvailable onStartOnboarding={onStartOnboarding} />
      );
      await userEvent.click(screen.getByTestId('nightshiftStartOnboardingButton'));
      expect(onStartOnboarding).toHaveBeenCalledTimes(1);
    });
  });

  describe('gaps report flyout', () => {
    it('renders the gaps panel with one review CTA and the report timestamp copy', () => {
      renderNightshiftApp(<NightshiftApp gapsReport={mockGapsReport} agentBuilderAvailable />);
      expect(screen.getByTestId('nightshiftGapsPanel')).toBeInTheDocument();
      expect(screen.getByTestId('nightshiftViewGapsButton')).toBeInTheDocument();
      expect(screen.queryByTestId('nightshiftCloseGapsButton')).not.toBeInTheDocument();
      expect(
        screen.getByText(/We found these gaps when analyzing existing knowledge/)
      ).toBeInTheDocument();
      expect(screen.getByText(/Updated/)).toBeInTheDocument();
    });

    it('shows the gaps button when a report is available', () => {
      renderNightshiftApp(<NightshiftApp gapsReport={mockGapsReport} />);
      expect(screen.getByTestId('nightshiftViewGapsButton')).toBeEnabled();
    });

    it('disables the gaps button when no report is available', () => {
      renderNightshiftApp(<NightshiftApp />);
      expect(screen.getByTestId('nightshiftViewGapsButton')).toBeDisabled();
    });

    it('opens the gaps report in a flyout', async () => {
      renderNightshiftApp(<NightshiftApp gapsReport={mockGapsReport} />);
      await userEvent.click(screen.getByTestId('nightshiftViewGapsButton'));
      expect(screen.getByTestId('nightshiftGapsFlyout')).toBeInTheDocument();
      expect(screen.getByTestId('nightshiftGapsMarkdown')).toHaveTextContent(
        'Rollout strategy is not documented'
      );
    });

    it('starts a gap-closing chat from the flyout', async () => {
      const onStartGapClosing = jest.fn();
      renderNightshiftApp(
        <NightshiftApp
          gapsReport={mockGapsReport}
          agentBuilderAvailable
          onStartGapClosing={onStartGapClosing}
        />
      );
      await userEvent.click(screen.getByTestId('nightshiftViewGapsButton'));
      await userEvent.click(screen.getByTestId('nightshiftFlyoutCloseGapsButton'));
      expect(onStartGapClosing).toHaveBeenCalledWith();
      expect(screen.queryByTestId('nightshiftGapsFlyout')).not.toBeInTheDocument();
    });
  });

  describe('common connector suggestions', () => {
    it('renders missing connector types', () => {
      renderNightshiftApp(<NightshiftApp installedConnectorActionTypeIds={[]} />);
      expect(screen.getByTestId('nightshiftMissingConnectors')).toBeInTheDocument();
      expect(screen.getByLabelText('Close gaps starting with Slack')).toBeInTheDocument();
      expect(screen.getByLabelText('Close gaps starting with PagerDuty')).toBeInTheDocument();
      expect(screen.getByLabelText('Close gaps starting with GitHub')).toBeInTheDocument();
      expect(screen.queryByLabelText('Close gaps starting with Webhook')).not.toBeInTheDocument();
    });

    it('filters connector types that already have a connector', () => {
      renderNightshiftApp(
        <NightshiftApp installedConnectorActionTypeIds={['.slack_api', '.pagerduty']} />
      );
      expect(screen.queryByLabelText('Close gaps starting with Slack')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Close gaps starting with PagerDuty')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Close gaps starting with Jira')).toBeInTheDocument();
    });

    it('hides the connector panel when all common types are configured', () => {
      renderNightshiftApp(
        <NightshiftApp
          installedConnectorActionTypeIds={[
            '.slack',
            '.teams',
            '.pagerduty',
            '.jira',
            '.servicenow',
            '.github',
          ]}
        />
      );
      expect(screen.queryByTestId('nightshiftMissingConnectors')).not.toBeInTheDocument();
    });

    it('starts gap closing from a selected connector', async () => {
      const onStartGapClosing = jest.fn();
      renderNightshiftApp(
        <NightshiftApp
          agentBuilderAvailable
          onStartGapClosing={onStartGapClosing}
          installedConnectorActionTypeIds={[]}
        />
      );
      await userEvent.click(screen.getByTestId('nightshiftConnectorGapClosingButton-slack'));
      expect(onStartGapClosing).toHaveBeenCalledWith('Slack');
    });
  });
});
