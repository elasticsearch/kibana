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
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { VegaSandboxExampleApp } from './app';

export const renderApp = (coreStart: CoreStart, { element }: AppMountParameters) => {
  ReactDOM.render(
    <KibanaRenderContextProvider {...coreStart}>
      <VegaSandboxExampleApp http={coreStart.http} />
    </KibanaRenderContextProvider>,
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
