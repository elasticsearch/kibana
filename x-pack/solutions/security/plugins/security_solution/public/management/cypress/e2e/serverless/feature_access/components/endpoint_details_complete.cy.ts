/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loadEndpointDetailsFlyout, workflowInsightsSelectors } from '../../../../screens/insights';
import type { CyIndexEndpointHosts } from '../../../../tasks/index_endpoint_hosts';
import { indexEndpointHosts } from '../../../../tasks/index_endpoint_hosts';
import { login, ROLE } from '../../../../tasks/login';

const { insightsComponentExists, connectorSelectorExists } = workflowInsightsSelectors;

describe(
  'Endpoint details',
  {
    tags: [
      '@serverless',
      // skipped on MKI since feature flags are not supported there
      '@skipInServerlessMKI',
    ],
    env: {
      ftrConfig: {
        productTypes: [
          { product_line: 'security', product_tier: 'complete' },
          { product_line: 'endpoint', product_tier: 'complete' },
        ],
      },
    },
  },
  () => {
    let loadedEndpoint: CyIndexEndpointHosts;
    let endpointId: string;

    // Since the endpoint is used only for displaying details flyout, we can use the same endpoint for all tests
    before(() => {
      indexEndpointHosts({ count: 1 }).then((indexedEndpoint) => {
        loadedEndpoint = indexedEndpoint;
        endpointId = indexedEndpoint.data.hosts[0].agent.id;
      });
    });

    after(() => {
      if (loadedEndpoint) {
        loadedEndpoint.cleanup();
      }
    });

    beforeEach(() => {
      login(ROLE.system_indices_superuser);
    });

    it('should render Insights section on endpoint flyout with option to define connectors', () => {
      loadEndpointDetailsFlyout(endpointId);
      insightsComponentExists();
      connectorSelectorExists();
    });
  }
);
