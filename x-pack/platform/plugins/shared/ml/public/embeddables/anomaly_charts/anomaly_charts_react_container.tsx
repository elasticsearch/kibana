/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import moment from 'moment-timezone';
import useMountedState from 'react-use/lib/useMountedState';
import { EuiCallOut, EuiLoadingChart, EuiResizeObserver, EuiText } from '@elastic/eui';
import type { Observable } from 'rxjs';
import { FormattedMessage } from '@kbn/i18n-react';
import { throttle } from 'lodash';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { type MlEntityField, type MlEntityFieldOperation } from '@kbn/ml-anomaly-utils';
import { TimeBuckets } from '@kbn/ml-time-buckets';
import useObservable from 'react-use/lib/useObservable';
import type { TimeRange } from '@kbn/es-query';
import { ML_APP_LOCATOR } from '@kbn/ml-common-types/locator_app_locator';
import type { MlLocatorParams } from '@kbn/ml-common-types/locator';
import { EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type {
  AnomalyChartsEmbeddableServices,
  AnomalyChartsApi,
  AnomalyChartsAttachmentApi,
} from '..';

import type { AnomaliesTableData, ExplorerJob } from '../../application/explorer/explorer_utils';
import { ExplorerAnomaliesContainer } from '../../application/explorer/explorer_charts/explorer_anomalies_container';
import { useAnomalyChartsData } from './use_anomaly_charts_data';
import { useDateFormatTz, loadAnomaliesTableData } from '../../application/explorer/explorer_utils';
import { useMlJobService } from '../../application/services/job_service';
import { useThresholdToSeverity } from '../../application/explorer/hooks/use_threshold_to_severity';
import { resolveSeverityFormat } from '../../../common/util/severity_threshold';
import { useDefaultSeverity } from '../../application/components/controls/select_severity/select_severity';

const RESIZE_THROTTLE_TIME_MS = 500;

export interface AnomalyChartsContainerProps {
  lastReloadRequestTime?: number;
  severityThreshold?: SeverityThreshold[];
  api: AnomalyChartsApi | AnomalyChartsAttachmentApi;
  id: string;
  services: AnomalyChartsEmbeddableServices;
  timeRange$: Observable<TimeRange | undefined>;
  onRenderComplete: () => void;
  onLoading: (v: boolean) => void;
  onError: (error: Error) => void;
  showFilterIcons?: boolean;
}

const AnomalyChartsContainer: FC<AnomalyChartsContainerProps> = ({
  id,
  timeRange$,
  severityThreshold,
  services,
  onRenderComplete,
  onError,
  onLoading,
  api,
  showFilterIcons = true,
}) => {
  const isMounted = useMountedState();

  const [tableData, setTableData] = useState<AnomaliesTableData>({
    anomalies: [],
    examplesByJobId: {},
    interval: 0,
    jobIds: [],
    showViewSeriesLink: false,
  });

  const [chartWidth, setChartWidth] = useState<number>(0);
  const thresholdsToSeverity = useThresholdToSeverity();

  // Define a default threshold to use when severityThreshold is undefined (embeddable creation)
  const { val: defaultThreshold } = useDefaultSeverity();

  // Initialize severity state from props or default
  const [severity, setSeverity] = useState(
    thresholdsToSeverity(
      severityThreshold !== undefined ? resolveSeverityFormat(severityThreshold) : defaultThreshold
    )
  );

  // Extract thresholds from severity objects for API updates and data fetching
  const severityThresholds = useMemo(() => severity.map((s) => s.threshold), [severity]);

  const [selectedEntities, setSelectedEntities] = useState<MlEntityField[] | undefined>();
  const [
    { uiSettings },
    { data: dataServices, share, uiActions, charts: chartsService },
    { mlApi },
  ] = services;

  const mlJobService = useMlJobService();

  const { timefilter } = dataServices.query.timefilter;
  const timeRange = useObservable(timeRange$);

  const mlLocator = useMemo(
    () => share.url.locators.get<MlLocatorParams>(ML_APP_LOCATOR)!,
    [share]
  );

  const timeBuckets = useMemo(() => {
    return new TimeBuckets({
      'histogram:maxBars': uiSettings.get(UI_SETTINGS.HISTOGRAM_MAX_BARS),
      'histogram:barTarget': uiSettings.get(UI_SETTINGS.HISTOGRAM_BAR_TARGET),
      dateFormat: uiSettings.get('dateFormat'),
      'dateFormat:scaled': uiSettings.get('dateFormat:scaled'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (api?.updateSeverityThreshold) {
      api.updateSeverityThreshold(severityThresholds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severityThresholds, api?.updateSeverityThreshold]);

  useEffect(() => {
    if (api?.updateSelectedEntities) {
      api.updateSelectedEntities(selectedEntities);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntities, api?.updateSelectedEntities]);

  const renderCallbacks = useMemo(() => {
    return { onRenderComplete, onError, onLoading };
  }, [onRenderComplete, onError, onLoading]);
  const {
    chartsData,
    isLoading: isExplorerLoading,
    error,
  } = useAnomalyChartsData(api, services, chartWidth, severityThresholds, renderCallbacks);

  const dateFormatTz = useDateFormatTz();

  useEffect(() => {
    // async IFEE
    (async () => {
      if (chartsData === undefined) {
        return;
      }

      try {
        await mlJobService.loadJobsWrapper();

        const explorerJobs: ExplorerJob[] =
          chartsData.seriesToPlot.map(({ jobId, bucketSpanSeconds }) => {
            return {
              id: jobId,
              selected: true,
              bucketSpanSeconds,
              modelPlotEnabled: false,
            };
          }) ?? [];

        const timeRangeBounds = {
          min: moment(chartsData.seriesToPlot[0].plotEarliest),
          max: moment(chartsData.seriesToPlot[0].plotLatest),
        };

        const newTableData = await loadAnomaliesTableData(
          mlApi,
          mlJobService,
          undefined,
          explorerJobs,
          dateFormatTz,
          timeRangeBounds,
          'job ID',
          'auto',
          { val: defaultThreshold }
        );

        if (isMounted()) {
          setTableData(newTableData);
        }
      } catch (err) {
        console.log(err); // eslint-disable-line no-console
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartsData]);

  // Holds the container height for previously fetched data
  const containerHeightRef = useRef<number>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resizeHandler = useCallback(
    throttle((e: { width: number; height: number }) => {
      // Keep previous container height so it doesn't change the page layout
      if (!isExplorerLoading) {
        containerHeightRef.current = e.height;
      }

      if (Math.abs(chartWidth - e.width) > 20) {
        setChartWidth(e.width);
      }
    }, RESIZE_THROTTLE_TIME_MS),
    [!isExplorerLoading, chartWidth]
  );

  const containerHeight = useMemo(() => {
    // Persists container height during loading to prevent page from jumping
    return isExplorerLoading ? containerHeightRef.current : undefined;
  }, [isExplorerLoading]);

  if (error) {
    return (
      <EuiCallOut
        announceOnMount={false}
        title={
          <FormattedMessage
            id="xpack.ml.anomalyChartsEmbeddable.errorMessage"
            defaultMessage="Unable to load the data for the anomaly charts"
          />
        }
        color="danger"
        iconType="warning"
        css={{ width: '100%' }}
      >
        <p>{error.message}</p>
      </EuiCallOut>
    );
  }

  const addEntityFieldFilter = (
    fieldName: string,
    fieldValue: string,
    operation: MlEntityFieldOperation
  ) => {
    const entity: MlEntityField = {
      fieldName,
      fieldValue,
      operation,
    };
    const uniqueSelectedEntities = [entity];
    setSelectedEntities(uniqueSelectedEntities);
    uiActions.executeTriggerActions(EXPLORER_ENTITY_FIELD_SELECTION_TRIGGER, {
      embeddable: api,
      data: uniqueSelectedEntities,
    });
  };

  return (
    <EuiResizeObserver onResize={resizeHandler}>
      {(resizeRef) => (
        <div
          id={`mlAnomalyExplorerEmbeddableWrapper-${id}`}
          style={{
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '8px',
            height: containerHeight,
          }}
          data-test-subj={`mlExplorerEmbeddable_${id}`}
          ref={resizeRef}
        >
          {isExplorerLoading && (
            <EuiText
              textAlign={'center'}
              css={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
              }}
            >
              <EuiLoadingChart
                size="xl"
                data-test-subj="mlAnomalyExplorerEmbeddableLoadingIndicator"
              />
            </EuiText>
          )}
          {chartsData !== undefined && isExplorerLoading === false ? (
            <ExplorerAnomaliesContainer
              id={id}
              showCharts={true}
              chartsData={chartsData}
              severity={severityThresholds}
              setSeverity={setSeverity}
              mlLocator={mlLocator}
              tableData={tableData}
              timeBuckets={timeBuckets}
              timefilter={timefilter}
              onSelectEntity={addEntityFieldFilter}
              showSelectedInterval={false}
              chartsService={chartsService}
              timeRange={timeRange}
              showFilterIcons={showFilterIcons}
            />
          ) : null}
        </div>
      )}
    </EuiResizeObserver>
  );
};

// required for dynamic import using React.lazy()
// eslint-disable-next-line import/no-default-export
export default AnomalyChartsContainer;
