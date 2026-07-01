/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { Fragment, useContext, useEffect, useState, useMemo } from 'react';
import type { AggFieldPair, Aggregation, Field } from '@kbn/ml-anomaly-utils';

import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { useUiSettings } from '../../../../../../../contexts/kibana';
import { JobCreatorContext } from '../../../job_creator_context';
import type { MultiMetricJobCreator } from '../../../../../common/job_creator';
import type { LineChartData } from '../../../../../common/chart_loader';
import type { DropDownLabel, DropDownProps } from '../agg_select';
import { useNewJobCapsService } from '../../../../../../../services/new_job_capabilities/new_job_capabilities_service';
import { sortFields } from '../../../../../../../../../common/util/fields_utils';
import { getChartSettings, defaultChartSettings } from '../../../charts/common/settings';
import { MetricSelector } from '../metric_selector';
import { ChartGrid } from './chart_grid';
import { useToastNotificationService } from '../../../../../../../services/toast_notification_service';

interface Props {
  setIsValid: (na: boolean) => void;
}

export const MultiMetricDetectors: FC<Props> = ({ setIsValid }) => {
  const uiSettings = useUiSettings();
  const {
    jobCreator: jc,
    jobCreatorUpdate,
    jobCreatorUpdated,
    chartLoader,
    chartInterval,
  } = useContext(JobCreatorContext);
  const jobCreator = jc as MultiMetricJobCreator;
  const toastNotificationService = useToastNotificationService();
  const newJobCapsService = useNewJobCapsService();

  const fields = useMemo(
    () => sortFields([...newJobCapsService.fields, ...jobCreator.runtimeFields]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [selectedOptions, setSelectedOptions] = useState<DropDownProps>([]);
  const [aggFieldPairList, setAggFieldPairList] = useState<AggFieldPair[]>(
    jobCreator.aggFieldPairs
  );
  const [lineChartsData, setLineChartsData] = useState<LineChartData>({});
  const [loadingData, setLoadingData] = useState(false);
  const [start, setStart] = useState(jobCreator.start);
  const [end, setEnd] = useState(jobCreator.end);
  const [bucketSpanMs, setBucketSpanMs] = useState(jobCreator.bucketSpanMs);
  const [chartSettings, setChartSettings] = useState(defaultChartSettings);
  const [splitField, setSplitField] = useState(jobCreator.splitField);
  const [fieldValues, setFieldValues] = useState<string[]>([]);
  const [pageReady, setPageReady] = useState(false);

  const [projectRouting, setProjectRouting] = useState<string | null>(
    jobCreator.projectRouting ?? null
  );

  function detectorChangeHandler(selectedOptionsIn: DropDownLabel[]) {
    addDetector(selectedOptionsIn);
  }

  function addDetector(selectedOptionsIn: DropDownLabel[]) {
    if (selectedOptionsIn !== null && selectedOptionsIn.length) {
      const option = selectedOptionsIn[0] as DropDownLabel;
      if (typeof option !== 'undefined' && isPopulatedObject(option, ['agg', 'field'])) {
        const newPair = {
          agg: option.agg as Aggregation,
          field: option.field as Field,
        };
        setAggFieldPairList([...aggFieldPairList, newPair]);
        setSelectedOptions([]);
      } else {
        setAggFieldPairList([]);
      }
    }
  }

  function deleteDetector(index: number) {
    aggFieldPairList.splice(index, 1);
    setAggFieldPairList([...aggFieldPairList]);
  }

  useEffect(() => {
    setPageReady(true);
  }, []);

  // watch for changes in detector list length
  useEffect(() => {
    jobCreator.removeAllDetectors();
    aggFieldPairList.forEach((pair) => {
      jobCreator.addDetector(pair.agg, pair.field);
    });
    jobCreatorUpdate();
    loadCharts();
    setIsValid(aggFieldPairList.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggFieldPairList.length]);

  // watch for change in jobCreator
  useEffect(() => {
    if (jobCreator.start !== start || jobCreator.end !== end) {
      setStart(jobCreator.start);
      setEnd(jobCreator.end);
      loadCharts();
    }

    if (jobCreator.bucketSpanMs !== bucketSpanMs) {
      setBucketSpanMs(jobCreator.bucketSpanMs);
      loadCharts();
    }

    if (jobCreator.projectRouting !== projectRouting) {
      setProjectRouting(jobCreator.projectRouting ?? null);
      loadCharts();
    }

    setSplitField(jobCreator.splitField);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreatorUpdated]);

  // watch for changes in split field.
  // load example field values
  // changes to fieldValues here will trigger the card effect
  useEffect(() => {
    if (splitField !== null) {
      chartLoader
        .loadFieldExampleValues(
          splitField,
          jobCreator.runtimeMappings,
          jobCreator.datafeedConfig.indices_options,
          jobCreator.projectRouting ?? undefined
        )
        .then(setFieldValues)
        .catch((error) => {
          toastNotificationService.displayErrorToast(error);
        });
    } else {
      setFieldValues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitField]);

  // watch for changes in the split field values
  // reload the charts
  useEffect(() => {
    loadCharts();
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
          aggFieldPairList,
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
        setLineChartsData([]);
      }
      setLoadingData(false);
    }
  }

  function allDataReady() {
    return (
      pageReady &&
      aggFieldPairList.length > 0 &&
      (splitField === null || (splitField !== null && fieldValues.length > 0))
    );
  }

  return (
    <Fragment>
      <ChartGrid
        aggFieldPairList={aggFieldPairList}
        chartSettings={chartSettings}
        splitField={splitField}
        fieldValues={fieldValues}
        lineChartsData={lineChartsData}
        modelData={[]}
        anomalyData={[]}
        deleteDetector={deleteDetector}
        jobType={jobCreator.type}
        loading={loadingData}
      />

      <MetricSelector
        fields={fields}
        detectorChangeHandler={detectorChangeHandler}
        selectedOptions={selectedOptions}
        removeOptions={aggFieldPairList}
      />
    </Fragment>
  );
};
