/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { Fragment, useContext, useEffect, useState } from 'react';

import { useUiSettings } from '../../../../../../../contexts/kibana';
import { JobCreatorContext } from '../../../job_creator_context';
import type { MultiMetricJobCreator } from '../../../../../common/job_creator';
import type { Results, ModelItem, Anomaly } from '../../../../../common/results_loader';
import type { LineChartData } from '../../../../../common/chart_loader';
import { getChartSettings, defaultChartSettings } from '../../../charts/common/settings';
import { ChartGrid } from './chart_grid';
import { useToastNotificationService } from '../../../../../../../services/toast_notification_service';

export const MultiMetricDetectorsSummary: FC = () => {
  const uiSettings = useUiSettings();
  const {
    jobCreator: jc,
    chartLoader,
    resultsLoader,
    chartInterval,
  } = useContext(JobCreatorContext);
  const jobCreator = jc as MultiMetricJobCreator;
  const toastNotificationService = useToastNotificationService();

  const [lineChartsData, setLineChartsData] = useState<LineChartData>({});
  const [loadingData, setLoadingData] = useState(false);
  const [modelData, setModelData] = useState<Record<number, ModelItem[]>>([]);
  const [anomalyData, setAnomalyData] = useState<Record<number, Anomaly[]>>([]);
  const [chartSettings, setChartSettings] = useState(defaultChartSettings);
  const [fieldValues, setFieldValues] = useState<string[]>([]);

  function setResultsWrapper(results: Results) {
    setModelData(results.model);
    setAnomalyData(results.anomalies);
  }

  useEffect(() => {
    // subscribe to progress and results
    const subscription = resultsLoader.subscribeToResults(setResultsWrapper);

    (async () => {
      if (jobCreator.splitField !== null) {
        try {
          const tempFieldValues = await chartLoader.loadFieldExampleValues(
            jobCreator.splitField,
            jobCreator.runtimeMappings,
            jobCreator.datafeedConfig.indices_options,
            jobCreator.projectRouting ?? undefined
          );
          setFieldValues(tempFieldValues);
        } catch (error) {
          toastNotificationService.displayErrorToast(error);
        }
      }
    })();

    return () => {
      subscription.unsubscribe();
    };
    // skip toastNotificationService from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartLoader, resultsLoader, jobCreator]);

  useEffect(() => {
    if (allDataReady()) {
      loadCharts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues]);

  async function loadCharts() {
    if (allDataReady()) {
      setLoadingData(true);
      try {
        const cs = getChartSettings(uiSettings, jobCreator, chartInterval);
        setChartSettings(cs);
        const resp: LineChartData = await chartLoader.loadLineCharts(
          jobCreator.start,
          jobCreator.end,
          jobCreator.aggFieldPairs,
          jobCreator.splitField,
          fieldValues.length > 0 ? fieldValues[0] : null,
          cs.intervalMs,
          jobCreator.runtimeMappings,
          jobCreator.datafeedConfig.indices_options,
          jobCreator.projectRouting ?? undefined
        );
        setLineChartsData(resp);
      } catch (error) {
        toastNotificationService.displayErrorToast(error);
        setLineChartsData({});
      }
      setLoadingData(false);
    }
  }

  function allDataReady() {
    return (
      jobCreator.aggFieldPairs.length > 0 &&
      (jobCreator.splitField === null || (jobCreator.splitField !== null && fieldValues.length > 0))
    );
  }

  return (
    <Fragment>
      {Object.keys(lineChartsData).length && (
        <ChartGrid
          aggFieldPairList={jobCreator.aggFieldPairs}
          chartSettings={chartSettings}
          splitField={jobCreator.splitField}
          fieldValues={fieldValues}
          lineChartsData={lineChartsData}
          modelData={modelData}
          anomalyData={anomalyData}
          deleteDetector={undefined}
          jobType={jobCreator.type}
          loading={loadingData}
        />
      )}
    </Fragment>
  );
};
