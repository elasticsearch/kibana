/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCallOut,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
} from '@elastic/eui';
import { Context, CoreStart } from '@kbn/core-di-browser';
import { PluginStart } from '@kbn/core-di';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { WorkflowApi } from '@kbn/workflows-ui';
import type { Decorator } from '@storybook/react';
import { Container } from 'inversify';
import { action } from '@storybook/addon-actions';
import React, { useMemo } from 'react';

const buildContainer = () => {
  const container = new Container({ defaultScope: 'Singleton' });

  container.bind(CoreStart('application')).toConstantValue({
    getUrlForApp: (appId: string, opts?: { path?: string }) => `/app/${appId}${opts?.path ?? ''}`,
    navigateToUrl: action('application.navigateToUrl'),
    navigateToApp: action('application.navigateToApp'),
    currentAppId$: { subscribe: () => ({ unsubscribe: () => {} }) },
    capabilities: {},
  } as any);

  container.bind(CoreStart('uiSettings')).toConstantValue({
    get: () => true,
    get$: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  } as any);

  container.bind(CoreStart('notifications')).toConstantValue({
    toasts: {
      addError: action('notifications.toasts.addError'),
      addSuccess: action('notifications.toasts.addSuccess'),
      addWarning: action('notifications.toasts.addWarning'),
      addDanger: action('notifications.toasts.addDanger'),
    },
  } as any);

  container.bind(CoreStart('http')).toConstantValue({
    get: async () => [],
    post: async () => ({}),
    patch: async () => ({}),
    delete: async () => ({}),
    basePath: { prepend: (p: string) => p, get: () => '' },
  } as any);

  container.bind(PluginStart('triggersActionsUi')).toConstantValue({
    getAddConnectorFlyout: ({
      onClose,
      onConnectorCreated,
      initialConnector,
    }: {
      onClose: () => void;
      onConnectorCreated?: (connector: { id: string; name: string }) => void;
      initialConnector?: { actionTypeId?: string };
    }) => (
      <EuiFlyout onClose={onClose} size="s" aria-label="Create connector (stub)">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2>Create connector (stub)</h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiCallOut title="Storybook stub" color="primary" iconType="info">
            <p>Action type: {initialConnector?.actionTypeId ?? 'any'}</p>
          </EuiCallOut>
          <EuiButton
            color="primary"
            onClick={() => {
              action('onConnectorCreated')({ id: 'new-stub-connector', name: 'New connector' });
              onConnectorCreated?.({ id: 'new-stub-connector', name: 'New connector' });
            }}
          >
            Save connector
          </EuiButton>
        </EuiFlyoutBody>
      </EuiFlyout>
    ),
  });

  container.bind(WorkflowApi).toConstantValue({
    getWorkflows: async () => ({ page: 1, size: 100, total: 0, results: [] }),
  } as any);

  return container;
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const DiDecorator: Decorator = (storyFn) => {
  const container = useMemo(buildContainer, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Context.Provider value={container}>{storyFn()}</Context.Provider>
    </QueryClientProvider>
  );
};

export const decorators = [DiDecorator];
