/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import ReactDOM from 'react-dom';
import type { AppMountParameters } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { QueryClientProvider } from '@kbn/react-query';
import { WorkflowsContextProvider } from './common/context';
import { WorkflowsRoutes } from './routes';
import { queryClient } from './shared/lib/query_client';
import type { WorkflowsServices } from './types';

export const renderApp = (
  services: WorkflowsServices,
  { history, element }: AppMountParameters
) => {
  ReactDOM.render(
    services.rendering.addContext(
      <KibanaContextProvider services={services}>
        <QueryClientProvider client={queryClient}>
          <WorkflowsContextProvider>
            <WorkflowsRoutes history={history} />
          </WorkflowsContextProvider>
        </QueryClientProvider>
      </KibanaContextProvider>
    ),
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
