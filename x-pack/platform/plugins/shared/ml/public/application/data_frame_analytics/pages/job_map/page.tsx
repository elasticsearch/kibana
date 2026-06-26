/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useState, useEffect, useCallback } from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useUrlState } from '@kbn/ml-url-state';
import { NodeAvailableWarning } from '../../../components/node_available_warning';
import { SavedObjectsWarning } from '../../../components/saved_objects_warning';
import { UpgradeWarning } from '../../../components/upgrade';
import { JobMap } from '.';
import { HelpMenu } from '../../../components/help_menu';
import { useMlKibana, useMlApi } from '../../../contexts/kibana';
import { useRefreshAnalyticsList } from '../../common';
import type { AnalyticsSelectorIds } from '../components/analytics_selector';
import { AnalyticsIdSelector, AnalyticsIdSelectorControls } from '../components/analytics_selector';
import { AnalyticsEmptyPrompt } from '../analytics_management/components/empty_prompt';
import { MlAppHeader } from '../../../components/ml_app_header';
import { JobInfoFlyoutsProvider } from '../../../jobs/components/job_details_flyout/job_details_flyout_context';
import { AnalyticsDetailFlyout } from '../analytics_exploration/components/analytics_detail_flyout';

export const Page: FC = () => {
  const [globalState, setGlobalState] = useUrlState('_g');
  const jobId = globalState?.ml?.jobId;
  const modelId = globalState?.ml?.modelId;

  const [isLoading, setIsLoading] = useState(false);
  const [isIdSelectorFlyoutVisible, setIsIdSelectorFlyoutVisible] = useState<boolean>(false);
  const [jobsExist, setJobsExist] = useState(true);
  const [isLoadingJobsExist, setIsLoadingJobsExist] = useState(false);
  const { refresh } = useRefreshAnalyticsList({ isLoading: setIsLoading });

  const onAnalyticsIdChange = useCallback(
    (analyticsId: AnalyticsSelectorIds) => {
      setGlobalState({
        ml: {
          ...(analyticsId.job_id && !analyticsId.model_id ? { jobId: analyticsId.job_id } : {}),
          ...(analyticsId.model_id ? { modelId: analyticsId.model_id } : {}),
        },
      });
    },
    [setGlobalState]
  );

  const {
    services: { docLinks },
  } = useMlKibana();
  const {
    dataFrameAnalytics: { getDataFrameAnalytics },
  } = useMlApi();
  const helpLink = docLinks.links.ml.dataFrameAnalytics;

  const checkJobsExist = async () => {
    setIsLoadingJobsExist(true);
    try {
      const { count } = await getDataFrameAnalytics(undefined, undefined, 0);
      const hasAnalyticsJobs = count > 0;
      setJobsExist(hasAnalyticsJobs);
      setIsIdSelectorFlyoutVisible(hasAnalyticsJobs && !jobId && !modelId);
    } catch (e) {
      // Swallow the error and just show the empty table in the analytics id selector
      console.error('Error checking analytics jobs exist', e); // eslint-disable-line no-console
    } finally {
      setIsLoadingJobsExist(false);
    }
  };

  useEffect(function checkJobs() {
    checkJobsExist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getEmptyState = () => {
    if (isLoadingJobsExist) {
      return null;
    }

    if (jobsExist === false) {
      return <AnalyticsEmptyPrompt showDocsLink iconSize="s" />;
    }
    return (
      <>
        <EuiEmptyPrompt
          iconType="warning"
          title={
            <h2>
              <FormattedMessage
                id="xpack.ml.dataframe.analyticsMap.noJobSelectedLabel"
                defaultMessage="No Analytics ID selected"
              />
            </h2>
          }
          data-test-subj="mlNoAnalyticsFound"
        />
      </>
    );
  };

  return (
    <JobInfoFlyoutsProvider>
      <AnalyticsDetailFlyout />
      <AnalyticsIdSelectorControls
        setIsIdSelectorFlyoutVisible={setIsIdSelectorFlyoutVisible}
        selectedId={jobId ?? modelId}
      />
      {isIdSelectorFlyoutVisible ? (
        <AnalyticsIdSelector
          setAnalyticsId={onAnalyticsIdChange}
          setIsIdSelectorFlyoutVisible={setIsIdSelectorFlyoutVisible}
        />
      ) : null}
      <MlAppHeader
        title={i18n.translate('xpack.ml.dataframe.analyticsMap.title', {
          defaultMessage: 'Analytics map',
        })}
      />

      <NodeAvailableWarning />

      <SavedObjectsWarning onCloseFlyout={refresh} />
      <UpgradeWarning />

      {jobId || modelId ? (
        <JobMap
          key={`${jobId ?? modelId}-id`}
          analyticsId={jobId}
          modelId={modelId}
          forceRefresh={isLoading}
        />
      ) : (
        getEmptyState()
      )}
      <HelpMenu docLink={helpLink} />
    </JobInfoFlyoutsProvider>
  );
};
