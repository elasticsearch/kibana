/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useContext, useEffect, useState } from 'react';
import { JobCreatorContext } from '../../../job_creator_context';
import type { CategorizationJobCreator } from '../../../../../common/job_creator';
import type { Results, Anomaly } from '../../../../../common/results_loader';
import type { LineChartPoint } from '../../../../../common/chart_loader';
import { EventRateChart } from '../../../charts/event_rate_chart';
import { TopCategories } from './top_categories';
import { CategoryStoppedPartitions } from './category_stopped_partitions';

const DTR_IDX = 0;

export const CategorizationDetectorsSummary: FC = () => {
  const {
    jobCreator: jc,
    chartLoader,
    resultsLoader,
    chartInterval,
  } = useContext(JobCreatorContext);
  const jobCreator = jc as CategorizationJobCreator;

  const [loadingData, setLoadingData] = useState(false);
  const [anomalyData, setAnomalyData] = useState<Anomaly[]>([]);
  const [eventRateChartData, setEventRateChartData] = useState<LineChartPoint[]>([]);
  const [jobIsRunning, setJobIsRunning] = useState(false);

  function setResultsWrapper(results: Results) {
    const anomalies = results.anomalies[DTR_IDX];
    if (anomalies !== undefined) {
      setAnomalyData(anomalies);
    }
  }

  function watchProgress(progress: number) {
    setJobIsRunning(progress > 0);
  }

  useEffect(() => {
    // subscribe to progress and results
    const resultsSubscription = resultsLoader.subscribeToResults(setResultsWrapper);
    jobCreator.subscribeToProgress(watchProgress);
    loadChart();
    return () => {
      resultsSubscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadChart() {
    setLoadingData(true);
    try {
      const resp = await chartLoader.loadEventRateChart(
        jobCreator.start,
        jobCreator.end,
        chartInterval.getInterval().asMilliseconds(),
        jobCreator.runtimeMappings ?? undefined,
        jobCreator.datafeedConfig.indices_options,
        jobCreator.projectRouting ?? undefined
      );
      setEventRateChartData(resp);
    } catch (error) {
      setEventRateChartData([]);
    }
    setLoadingData(false);
  }

  return (
    <>
      <EventRateChart
        eventRateChartData={eventRateChartData}
        anomalyData={anomalyData}
        height="300px"
        width="100%"
        showAxis={true}
        loading={loadingData}
        fadeChart={jobIsRunning}
      />
      <TopCategories />
      <CategoryStoppedPartitions />
    </>
  );
};
