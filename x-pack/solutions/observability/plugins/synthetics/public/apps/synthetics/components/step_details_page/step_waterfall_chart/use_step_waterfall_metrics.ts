/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createEsParams } from '@kbn/observability-shared-plugin/public';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { getSyntheticsCcsIndex } from '../../../../../../common/get_synthetics_indices';
import { useGetUrlParams } from '../../../hooks';
import type { MarkerItems } from './waterfall/context/waterfall_context';

export interface Props {
  checkGroup: string;
  stepIndex: number;
  hasNavigationRequest?: boolean;
}
export const BROWSER_TRACE_TYPE = 'browser.relative_trace.type';
export const BROWSER_TRACE_NAME = 'browser.relative_trace.name';
export const BROWSER_TRACE_START = 'browser.relative_trace.start.us';
export const NAVIGATION_START = 'navigationStart';

export const useStepWaterfallMetrics = ({ checkGroup, hasNavigationRequest, stepIndex }: Props) => {
  const { remoteName } = useGetUrlParams();
  const index = getSyntheticsCcsIndex(remoteName);

  const { data, loading } = useSyntheticsEsSearch(
    hasNavigationRequest
      ? createEsParams({
          index,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    'synthetics.step.index': stepIndex,
                  },
                },
                {
                  term: {
                    'monitor.check_group': checkGroup,
                  },
                },
                {
                  term: {
                    'synthetics.type': 'step/metrics',
                  },
                },
              ],
            },
          },
          fields: ['browser.*'],
          size: 1000,
          _source: false,
        })
      : {},
    [checkGroup, hasNavigationRequest, remoteName],
    {
      name: 'getWaterfallStepMetrics',
    }
  );

  if (!hasNavigationRequest) {
    return { metrics: [], loading: false };
  }

  const metrics: MarkerItems = [];

  if (data && hasNavigationRequest) {
    const metricDocs = data.hits.hits as unknown as Array<{ fields: any }>;
    let navigationStart = 0;
    let navigationStartExist = false;

    metricDocs.forEach(({ fields }) => {
      if (fields[BROWSER_TRACE_TYPE]?.[0] === 'mark') {
        const { [BROWSER_TRACE_NAME]: metricType, [BROWSER_TRACE_START]: metricValue } = fields;
        if (metricType?.[0] === NAVIGATION_START) {
          navigationStart = metricValue?.[0];
          navigationStartExist = true;
        }
      }
    });

    if (navigationStartExist) {
      metricDocs.forEach(({ fields }) => {
        if (fields[BROWSER_TRACE_TYPE]?.[0] === 'mark') {
          const { [BROWSER_TRACE_NAME]: metricType, [BROWSER_TRACE_START]: metricValue } = fields;
          if (metricType?.[0] !== NAVIGATION_START) {
            metrics.push({
              id: metricType?.[0],
              offset: (metricValue?.[0] - navigationStart) / 1000,
            });
          }
        }
      });
    }
  }

  return { metrics, loading };
};
