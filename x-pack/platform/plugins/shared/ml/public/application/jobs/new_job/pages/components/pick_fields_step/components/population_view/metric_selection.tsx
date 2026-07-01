/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { Fragment, useContext, useEffect, useState, useReducer, useMemo } from 'react';
import { EuiHorizontalRule } from '@elastic/eui';
import type { Field, AggFieldPair, Aggregation } from '@kbn/ml-anomaly-utils';

import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { useUiSettings } from '../../../../../../../contexts/kibana';
import { JobCreatorContext } from '../../../job_creator_context';
import type { PopulationJobCreator } from '../../../../../common/job_creator';
import type { LineChartData } from '../../../../../common/chart_loader';
import type { DropDownLabel, DropDownProps } from '../agg_select';
import { useNewJobCapsService } from '../../../../../../../services/new_job_capabilities/new_job_capabilities_service';
import { sortFields } from '../../../../../../../../../common/util/fields_utils';
import { getChartSettings, defaultChartSettings } from '../../../charts/common/settings';
import { MetricSelector } from '../metric_selector';
import { PopulationFieldSelector } from '../population_field';
import { ChartGrid } from './chart_grid';
import { useToastNotificationService } from '../../../../../../../services/toast_notification_service';

interface Props {
  setIsValid: (na: boolean) => void;
}

type DetectorFieldValues = Record<number, string[]>;

export const PopulationDetectors: FC<Props> = ({ setIsValid }) => {
  const uiSettings = useUiSettings();
  const {
    jobCreator: jc,
    jobCreatorUpdate,
    jobCreatorUpdated,
    chartLoader,
    chartInterval,
  } = useContext(JobCreatorContext);
  const jobCreator = jc as PopulationJobCreator;
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
  const [populationField, setPopulationField] = useState(jobCreator.populationField);
  const [fieldValuesPerDetector, setFieldValuesPerDetector] = useState<DetectorFieldValues>({});
  const [byFieldsUpdated, setByFieldsUpdated] = useReducer<(s: number, action: any) => number>(
    (s) => s + 1,
    0
  );
  const [pageReady, setPageReady] = useState(false);

  const [projectRouting, setProjectRouting] = useState<string | null>(
    jobCreator.projectRouting ?? null
  );

  const updateByFields = () => setByFieldsUpdated(0);

  function detectorChangeHandler(selectedOptionsIn: DropDownLabel[]) {
    addDetector(selectedOptionsIn);
  }

  function addDetector(selectedOptionsIn: DropDownLabel[]) {
    if (selectedOptionsIn !== null && selectedOptionsIn.length) {
      const option = selectedOptionsIn[0] as DropDownLabel & { field: Field };
      if (typeof option !== 'undefined' && isPopulatedObject(option, ['agg', 'field'])) {
        const newPair: AggFieldPair = {
          agg: option.agg as Aggregation,
          field: option.field,
          by: { field: null, value: null },
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
    updateByFields();
  }

  useEffect(() => {
    setPageReady(true);
  }, []);

  // watch for changes in detector list length
  useEffect(() => {
    jobCreator.removeAllDetectors();
    aggFieldPairList.forEach((pair, i) => {
      jobCreator.addDetector(pair.agg, pair.field);
      if (pair.by !== undefined) {
        // re-add by fields
        jobCreator.setByField(pair.by.field, i);
      }
    });
    jobCreatorUpdate();
    loadCharts();
    setIsValid(aggFieldPairList.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggFieldPairList.length]);

  // watch for changes in by field values
  // redraw the charts if they change.
  // triggered when example fields have been loaded
  // if the split field or by fields have changed
  useEffect(() => {
    loadCharts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fieldValuesPerDetector), populationField, pageReady]);

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

    setPopulationField(jobCreator.populationField);

    // update by fields and their by fields
    let update = false;
    const newList = [...aggFieldPairList];
    newList.forEach((pair, i) => {
      const bf = jobCreator.getByField(i);
      if (pair.by !== undefined && pair.by.field !== bf) {
        pair.by.field = bf;
        update = true;
      }
    });
    if (update) {
      setAggFieldPairList(newList);
      updateByFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreatorUpdated]);

  // watch for changes in split field or by fields.
  // load example field values
  // changes to fieldValues here will trigger the card effect via setFieldValuesPerDetector
  useEffect(() => {
    loadFieldExamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [populationField, byFieldsUpdated]);

  async function loadCharts() {
    if (allDataReady()) {
      setLoadingData(true);
      try {
        const cs = getChartSettings(uiSettings, jobCreator, chartInterval);
        setChartSettings(cs);
        const resp: LineChartData = await chartLoader.loadPopulationCharts(
          jobCreator.start,
          jobCreator.end,
          aggFieldPairList,
          jobCreator.populationField,
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

  async function loadFieldExamples() {
    const promises: any[] = [];
    aggFieldPairList.forEach((af, i) => {
      if (af.by !== undefined && af.by.field !== null) {
        promises.push(
          (async (index: number, field: Field) => {
            return {
              index,
              fields: await chartLoader.loadFieldExampleValues(
                field,
                jobCreator.runtimeMappings,
                jobCreator.datafeedConfig.indices_options,
                jobCreator.projectRouting ?? undefined
              ),
            };
          })(i, af.by.field)
        );
      }
    });
    const results = await Promise.all(promises);
    const fieldValues = results.reduce((p, c) => {
      p[c.index] = c.fields;
      return p;
    }, {}) as DetectorFieldValues;

    const newPairs = aggFieldPairList.map((pair, i) => ({
      ...pair,
      ...(pair.by === undefined || pair.by.field === null
        ? {}
        : {
            by: {
              ...pair.by,
              value: fieldValues[i][0],
            },
          }),
    }));
    setAggFieldPairList([...newPairs]);
    setFieldValuesPerDetector(fieldValues);
  }

  function allDataReady() {
    let ready = aggFieldPairList.length > 0;
    aggFieldPairList.forEach((af) => {
      if (af.by !== undefined && af.by.field !== null) {
        // if a by field is set, it's only ready when the value is loaded
        ready = ready && af.by.value !== null;
      }
    });
    return ready;
  }

  return (
    <Fragment>
      <PopulationFieldSelector />
      {populationField !== null && <EuiHorizontalRule margin="l" />}

      {populationField !== null && (
        <ChartGrid
          aggFieldPairList={aggFieldPairList}
          chartSettings={chartSettings}
          splitField={populationField}
          lineChartsData={lineChartsData}
          modelData={[]}
          anomalyData={[]}
          deleteDetector={deleteDetector}
          jobType={jobCreator.type}
          fieldValuesPerDetector={fieldValuesPerDetector}
          loading={loadingData}
        />
      )}
      {populationField !== null && (
        <MetricSelector
          fields={fields}
          detectorChangeHandler={detectorChangeHandler}
          selectedOptions={selectedOptions}
          removeOptions={[]}
        />
      )}
    </Fragment>
  );
};
