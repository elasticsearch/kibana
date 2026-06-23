/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { memoize } from 'lodash';
import deepEqual from 'fast-deep-equal';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { BehaviorSubject } from 'rxjs';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { UnifiedValueAttachmentViewProps } from '@kbn/cases-plugin/public';
import { FIELD_FORMAT_IDS } from '@kbn/field-formats-plugin/common';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { EuiDescriptionList, htmlIdGenerator } from '@elastic/eui';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type { AnomalyChartsAttachmentData } from '../../common/util/cases_utils';
import { LazyAnomalyChartsContainer } from '../embeddables/anomaly_charts/lazy_anomaly_charts_container';
import { initializeAnomalyChartsControls } from '../embeddables/anomaly_charts/initialize_anomaly_charts_controls';
import type {
  AnomalyChartsEmbeddableServices,
  AnomalyChartsAttachmentState,
  AnomalyChartsAttachmentApi,
} from '../embeddables';
import { transformOut } from '../../common/embeddables/anomaly_charts/transform_out';

type AnomalyChartsViewProps = UnifiedValueAttachmentViewProps<AnomalyChartsAttachmentData>;

interface AnomalyChartsCaseAttachmentProps extends AnomalyChartsAttachmentState {
  services: AnomalyChartsEmbeddableServices;
}
const AnomalyChartsCaseAttachment = ({
  services,
  ...rawState
}: AnomalyChartsCaseAttachmentProps) => {
  const id = useMemo(() => htmlIdGenerator()(), []);
  const [coreStartServices, pluginStartServices, mlServices] = services;
  const contextServices = useMemo(
    () => ({
      mlServices: {
        ...mlServices,
      },
      ...pluginStartServices,
      ...coreStartServices,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const api = useMemo(() => {
    const initialState: AnomalyChartsAttachmentState = rawState ?? {};
    const filters$ = new BehaviorSubject<Filter[] | undefined>(initialState.filters ?? []);
    const query$ = new BehaviorSubject<Query | undefined>(initialState.query ?? undefined);
    const timeRange$ = new BehaviorSubject<TimeRange | undefined>(initialState.time_range);

    const chartsManager = initializeAnomalyChartsControls(initialState);
    const combined: AnomalyChartsAttachmentApi = {
      ...chartsManager.api,
      ...chartsManager.dataLoadingApi,
      parentApi: { filters$, query$, timeRange$ },
    };
    return combined;
    // Initialize services upon first mount already,
    // as state management for cases
    // already handled by the initial state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div css={css({ display: 'flex', width: '100%' })}>
      <KibanaRenderContextProvider {...coreStartServices}>
        <KibanaContextProvider services={contextServices}>
          <LazyAnomalyChartsContainer
            id={`case-anomaly-charts-${id}`}
            severityThreshold={rawState.severity_threshold}
            api={api}
            services={services}
            onLoading={api.onLoading}
            onRenderComplete={api.onRenderComplete}
            onError={api.onError}
            timeRange$={api.parentApi.timeRange$}
            showFilterIcons={false}
          />
        </KibanaContextProvider>
      </KibanaRenderContextProvider>
    </div>
  );
};

function isValidTimeRange(arg: unknown): arg is TimeRange {
  return isPopulatedObject(arg, ['from', 'to']);
}

const normalizeAnomalyChartsAttachmentState = (
  attachmentState: Record<string, unknown>
): AnomalyChartsAttachmentState => {
  const embeddableState = transformOut(attachmentState as unknown as AnomalyChartsEmbeddableState);
  const { id, query, filters } = attachmentState as Partial<
    Pick<AnomalyChartsAttachmentState, 'id' | 'query' | 'filters'>
  >;

  return {
    ...embeddableState,
    ...(id !== undefined ? { id } : {}),
    ...(query !== undefined ? { query } : {}),
    ...(filters !== undefined ? { filters } : {}),
  };
};

export const initializeAnomalyChartsAttachment = memoize(
  (fieldFormats: FieldFormatsStart, services: AnomalyChartsEmbeddableServices) => {
    return React.memo(
      (props: AnomalyChartsViewProps) => {
        const attachmentState = props.data.state;

        const dataFormatter = fieldFormats.deserialize({
          id: FIELD_FORMAT_IDS.DATE,
        });

        const inputProps = normalizeAnomalyChartsAttachmentState(attachmentState);

        const descriptions = useMemo(() => {
          const listItems = [
            {
              title: (
                <FormattedMessage
                  id="xpack.ml.cases.anomalyCharts.description.jobIdsLabel"
                  defaultMessage="Job IDs"
                />
              ),
              description: inputProps.job_ids.join(', '),
            },
          ];

          if (isValidTimeRange(inputProps.time_range)) {
            listItems.push({
              title: (
                <FormattedMessage
                  id="xpack.ml.cases.anomalyCharts.description.timeRangeLabel"
                  defaultMessage="Time range"
                />
              ),
              description: `${dataFormatter.convertToText(
                inputProps.time_range.from
              )} - ${dataFormatter.convertToText(inputProps.time_range.to)}`,
            });
          }

          if (typeof inputProps.query?.query === 'string' && inputProps.query?.query !== '') {
            listItems.push({
              title: (
                <FormattedMessage
                  id="xpack.ml.cases.anomalySwimLane.description.queryLabel"
                  defaultMessage="Query"
                />
              ),
              description: inputProps.query?.query,
            });
          }
          return listItems;
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [
          dataFormatter,
          inputProps.job_ids,
          inputProps.query?.query,
          inputProps.time_range?.from,
          inputProps.time_range?.to,
        ]);
        return (
          <>
            <EuiDescriptionList compressed type={'inline'} listItems={descriptions} />
            <AnomalyChartsCaseAttachment services={services} {...inputProps} />
          </>
        );
      },
      (prevProps, nextProps) => deepEqual(prevProps.data.state, nextProps.data.state)
    );
  }
);
