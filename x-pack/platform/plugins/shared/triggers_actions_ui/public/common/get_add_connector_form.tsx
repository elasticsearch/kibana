/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ConnectorProvider } from '../application/context/connector_context';
import { CreateConnectorForm } from '../application/sections/action_connector_form';
import type { CreateConnectorFormProps } from '../application/sections/action_connector_form';
import type { ConnectorServices } from '../types';

const queryClient = new QueryClient();

export const getAddConnectorFormLazy = (
  props: CreateConnectorFormProps & { connectorServices: ConnectorServices }
) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectorProvider
        value={{ services: props.connectorServices, isServerless: !!props.isServerless }}
      >
        <CreateConnectorForm {...props} />
      </ConnectorProvider>
    </QueryClientProvider>
  );
};
