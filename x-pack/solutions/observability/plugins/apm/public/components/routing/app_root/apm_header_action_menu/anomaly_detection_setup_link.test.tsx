/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';
import { EuiThemeProvider } from '@kbn/kibana-react-plugin/common';
import type { ApmMlJob } from '../../../../../common/anomaly_detection/apm_ml_job';
import { getAnomalyDetectionSetupState } from '../../../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import { ENVIRONMENT_ALL } from '../../../../../common/environment_filter_values';
import * as hooks from '../../../../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';
import { MockApmPluginContextWrapper } from '../../../../context/apm_plugin/mock_apm_plugin_context';
import { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { AnomalyDetectionSetupLink } from './anomaly_detection_setup_link';
import * as environmentHooks from '../../../../context/environments_context/use_environments_context';

async function renderTooltipAnchor({
  jobs,
  environment,
}: {
  jobs: ApmMlJob[];
  environment?: string;
}) {
  // mock api response
  jest.spyOn(hooks, 'useAnomalyDetectionJobsContext').mockReturnValue({
    anomalyDetectionJobsData: {
      jobs,
      hasLegacyJobs: jobs.some((job) => job.version <= 2),
    },
    anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
    anomalyDetectionJobsRefetch: () => {},
    anomalyDetectionSetupState: getAnomalyDetectionSetupState({
      environment: environment ?? ENVIRONMENT_ALL.value,
      fetchStatus: FETCH_STATUS.SUCCESS,
      isAuthorized: true,
      jobs,
    }),
  });

  jest.spyOn(environmentHooks, 'useEnvironmentsContext').mockReturnValue({
    environment: environment ?? ENVIRONMENT_ALL.value,
    preferredEnvironment: environment ?? ENVIRONMENT_ALL.value,
    environments: environment ? [environment] : [],
    status: FETCH_STATUS.SUCCESS,
  });

  const history = createMemoryHistory({
    initialEntries: [
      `/services?environment=${environment || ENVIRONMENT_ALL.value}&rangeFrom=now-15m&rangeTo=now`,
    ],
  });

  const { baseElement, container } = render(
    <MockApmPluginContextWrapper history={history}>
      <EuiThemeProvider>
        <AnomalyDetectionSetupLink />
      </EuiThemeProvider>
    </MockApmPluginContextWrapper>
  );

  // hover tooltip anchor if it exists
  const toolTipAnchor = container.querySelector('.euiToolTipAnchor') as any;
  if (toolTipAnchor) {
    fireEvent.mouseOver(toolTipAnchor);

    // wait for tooltip text to be in the DOM
    await waitFor(() => {
      const toolTipText = baseElement.querySelector('.euiToolTipPopover')?.textContent;
      expect(toolTipText).not.toBe(undefined);
    });
  }

  const toolTipText = baseElement.querySelector('.euiToolTipPopover')?.textContent;

  return { toolTipText, toolTipAnchor };
}

describe('MissingJobsAlert', () => {
  describe('when no jobs exist', () => {
    it('shows a warning', async () => {
      const { toolTipText, toolTipAnchor } = await renderTooltipAnchor({
        jobs: [],
      });

      expect(toolTipAnchor).toBeInTheDocument();
      expect(toolTipText).toBe('Anomaly detection is not yet enabled. Click to continue setup.');
    });
  });

  describe('when no jobs exists for the selected environment', () => {
    it('shows a warning', async () => {
      const { toolTipAnchor, toolTipText } = await renderTooltipAnchor({
        jobs: [
          {
            environment: 'production',
            jobId: 'my_job_id',
            version: 3,
          } as ApmMlJob,
        ],
        environment: 'staging',
      });

      expect(toolTipAnchor).toBeInTheDocument();
      expect(toolTipText).toBe(
        'Anomaly detection is not yet enabled for the environment "staging". Click to continue setup.'
      );
    });
  });

  describe('when a job exists for the selected environment', () => {
    it('does not show a warning', async () => {
      const { toolTipAnchor, toolTipText } = await renderTooltipAnchor({
        jobs: [
          {
            environment: 'production',
            jobId: 'my_job_id',
            version: 3,
          } as ApmMlJob,
        ],
        environment: 'production',
      });

      expect(toolTipAnchor).not.toBeInTheDocument();
      expect(toolTipText).toBe(undefined);
    });
  });

  describe('when at least one job exists and no environment is selected', () => {
    it('does not show a warning', async () => {
      const { toolTipAnchor, toolTipText } = await renderTooltipAnchor({
        jobs: [
          {
            environment: 'production',
            jobId: 'my_job_id',
            version: 3,
          } as ApmMlJob,
        ],
      });

      expect(toolTipAnchor).not.toBeInTheDocument();
      expect(toolTipText).toBe(undefined);
    });
  });

  describe('when at least one job exists and all environments are selected', () => {
    it('does not show a warning', async () => {
      const { toolTipAnchor, toolTipText } = await renderTooltipAnchor({
        jobs: [
          {
            environment: 'ENVIRONMENT_ALL',
            jobId: 'my_job_id',
            version: 3,
          } as ApmMlJob,
        ],
      });

      expect(toolTipAnchor).not.toBeInTheDocument();
      expect(toolTipText).toBe(undefined);
    });
  });

  describe('when at least one legacy job exists', () => {
    it('displays a nudge to upgrade', async () => {
      const { toolTipAnchor, toolTipText } = await renderTooltipAnchor({
        jobs: [
          {
            environment: 'ENVIRONMENT_ALL',
            jobId: 'my_job_id',
            version: 2,
          } as ApmMlJob,
        ],
      });

      expect(toolTipAnchor).toBeInTheDocument();
      expect(toolTipText).toBe('Updates available for existing anomaly detection jobs.');
    });
  });

  describe('when both legacy and modern jobs exist', () => {
    it('does not show a tooltip', async () => {
      const { toolTipAnchor, toolTipText } = await renderTooltipAnchor({
        jobs: [
          {
            environment: 'ENVIRONMENT_ALL',
            jobId: 'my_job_id',
            version: 2,
          } as ApmMlJob,
          {
            environment: 'ENVIRONMENT_ALL',
            jobId: 'my_job_id_2',
            version: 3,
          } as ApmMlJob,
        ],
      });

      expect(toolTipAnchor).not.toBeInTheDocument();
      expect(toolTipText).toBe(undefined);
    });
  });
});
