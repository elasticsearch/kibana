/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';
import { MockApmPluginContextWrapper } from '../../../../context/apm_plugin/mock_apm_plugin_context';
import { MockUrlParamsContextProvider } from '../../../../context/url_params_context/mock_url_params_context_provider';
import { TransactionOverviewLink } from './transaction_overview_link';
import type { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';

const history = createMemoryHistory();

function Wrapper({ children }: React.PropsWithChildren) {
  return (
    <MockApmPluginContextWrapper history={history}>
      <MockUrlParamsContextProvider>{children}</MockUrlParamsContextProvider>
    </MockApmPluginContextWrapper>
  );
}

describe('Transactions overview link', () => {
  describe('TransactionOverviewLink', () => {
    function getHref(container: HTMLElement) {
      return ((container as HTMLDivElement).children[0] as HTMLAnchorElement).href;
    }
    it('returns transaction link with persisted query and prop items', () => {
      const avg = 'avg' as LatencyAggregationType;
      const { container } = render(
        <Wrapper>
          <TransactionOverviewLink
            serviceName="foo"
            latencyAggregationType={avg}
            transactionType="request"
            query={{
              environment: 'production',
              rangeFrom: 'now-15m',
              rangeTo: 'now',
              kuery: '',
              serviceGroup: '',
              comparisonEnabled: false,
            }}
          >
            Service name
          </TransactionOverviewLink>
        </Wrapper>
      );
      expect(getHref(container)).toEqual(
        'http://localhost/basepath/app/apm/services/foo/transactions?anomalyThreshold=major&comparisonEnabled=false&environment=production&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup=&transactionType=request'
      );
    });
    it('returns transaction link with persisted without transaction type', () => {
      const avg = 'avg' as LatencyAggregationType;
      const { container } = render(
        <Wrapper>
          <TransactionOverviewLink
            serviceName="foo"
            latencyAggregationType={avg}
            query={{
              environment: 'production',
              rangeFrom: 'now-15m',
              rangeTo: 'now',
              kuery: '',
              serviceGroup: '',
              comparisonEnabled: false,
            }}
          >
            Service name
          </TransactionOverviewLink>
        </Wrapper>
      );
      expect(getHref(container)).toEqual(
        'http://localhost/basepath/app/apm/services/foo/transactions?anomalyThreshold=major&comparisonEnabled=false&environment=production&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup='
      );
    });
    it('returns transaction link with persisted query with transaction type', () => {
      const avg = 'avg' as LatencyAggregationType;
      const { container } = render(
        <Wrapper>
          <TransactionOverviewLink
            serviceName="foo"
            latencyAggregationType={avg}
            query={{
              environment: 'production',
              rangeFrom: 'now-15m',
              rangeTo: 'now',
              kuery: '',
              serviceGroup: '',
              comparisonEnabled: false,
              transactionType: 'request',
            }}
          >
            Service name
          </TransactionOverviewLink>
        </Wrapper>
      );
      expect(getHref(container)).toEqual(
        'http://localhost/basepath/app/apm/services/foo/transactions?anomalyThreshold=major&comparisonEnabled=false&environment=production&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup=&transactionType=request'
      );
    });
  });
});
