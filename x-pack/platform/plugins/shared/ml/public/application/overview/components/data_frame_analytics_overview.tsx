/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EuiButton, EuiButtonEmpty, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import dfaImage from '../../data_frame_analytics/pages/analytics_management/components/empty_prompt/analysis_monitors.svg';
import { usePermissionCheck } from '../../capabilities/check_capabilities';
import { useMlApi, useMlLocator, useMlManagementLocator } from '../../contexts/kibana';
import { MLEmptyPromptCard } from '../../components/overview/ml_empty_prompt_card';
import { AnalyticsEmptyPrompt } from '../../data_frame_analytics/pages/analytics_management/components/empty_prompt/empty_prompt';
import { useOverviewPageCustomCss } from '../overview_ml_page';

export const DataFrameAnalyticsOverviewCard: FC = () => {
  const mlLocator = useMlLocator();
  const mlManagementLocator = useMlManagementLocator();

  const [hasDFAs, setHasDFAs] = useState(false);
  const canGetDataFrameAnalytics = usePermissionCheck('canGetDataFrameAnalytics');
  const overviewPageCardCustomCss = useOverviewPageCustomCss();

  const navigateToResultsExplorer = useCallback(async () => {
    if (!mlLocator) return;

    await mlLocator.navigate({
      sectionId: 'ml',
      page: ML_PAGES.DATA_FRAME_ANALYTICS_EXPLORATION,
    });
  }, [mlLocator]);

  const navigateToDFAManagementPath = useCallback(async () => {
    if (!mlManagementLocator) return;

    await mlManagementLocator.navigate({
      sectionId: 'ml',
      appId: `analytics`,
    });
  }, [mlManagementLocator]);

  const availableActions = useMemo(() => {
    const actions: React.ReactNode[] = [];
    if (hasDFAs && canGetDataFrameAnalytics) {
      actions.push(
        <EuiButton
          color="text"
          onClick={navigateToResultsExplorer}
          isDisabled={!canGetDataFrameAnalytics}
          data-test-subj="mlAnalyticsResultsExplorerButton"
        >
          <FormattedMessage
            id="xpack.ml.overview.dataFrameAnalytics.resultsExplorerButtonText"
            defaultMessage="Open results explorer"
          />
        </EuiButton>
      );
    }
    if (canGetDataFrameAnalytics) {
      actions.push(
        <EuiButtonEmpty
          color="text"
          onClick={navigateToDFAManagementPath}
          data-test-subj="mlAnalyticsManageDFAJobsButton"
        >
          <FormattedMessage
            id="xpack.ml.overview.dataFrameAnalytics.manageJobsButton"
            defaultMessage="Manage jobs"
          />
        </EuiButtonEmpty>
      );
    }
    return actions;
  }, [canGetDataFrameAnalytics, navigateToDFAManagementPath, hasDFAs, navigateToResultsExplorer]);

  const mlApi = useMlApi();
  useEffect(() => {
    const fetchAnalytics = async () => {
      const analyticsConfigs = await mlApi.dataFrameAnalytics.getDataFrameAnalytics();
      if (analyticsConfigs?.count > 0) {
        setHasDFAs(true);
      }
    };
    fetchAnalytics();
  }, [mlApi]);

  return !hasDFAs ? (
    <AnalyticsEmptyPrompt customCss={overviewPageCardCustomCss} iconSize="m" />
  ) : (
    <MLEmptyPromptCard
      customCss={overviewPageCardCustomCss}
      iconSrc={dfaImage}
      iconSize="m"
      iconAlt={i18n.translate('xpack.ml.dataFrame.analyticsList.emptyPromptTitle', {
        defaultMessage: 'Tailored predictive models',
      })}
      title={i18n.translate('xpack.ml.dataFrame.analyticsList.emptyPromptTitle', {
        defaultMessage: 'Tailored predictive models',
      })}
      body={
        <EuiText size="s">
          <FormattedMessage
            id="xpack.ml.overview.analyticsList.emptyPromptText"
            defaultMessage="Categorize data, predict values, and detect outliers using supervised and unsupervised machine learning in data frame analytics."
          />
        </EuiText>
      }
      actions={availableActions}
      data-test-subj="mlOverviewDataFrameAnalyticsCard"
    />
  );
};
