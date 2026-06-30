/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lazy } from 'react';
import { suspendedComponentWithProps } from '../../lib/suspended_component_with_props';
import type { ConnectorAddModalProps } from './connector_add_modal';
import type { CreateConnectorFlyoutProps } from './create_connector_flyout';
import type { CreateConnectorFormProps } from './create_connector_form';
import type { EditConnectorFlyoutProps } from './edit_connector_flyout';

export const CreateConnectorFlyout = suspendedComponentWithProps<CreateConnectorFlyoutProps>(
  lazy(() => import('./create_connector_flyout'))
);
export const CreateConnectorForm = suspendedComponentWithProps<CreateConnectorFormProps>(
  lazy(() => import('./create_connector_form'))
);
export const EditConnectorFlyout = suspendedComponentWithProps<EditConnectorFlyoutProps>(
  lazy(() => import('./edit_connector_flyout'))
);
export const ActionForm = suspendedComponentWithProps(lazy(() => import('./action_form')));

export const ConnectorAddModal = suspendedComponentWithProps<ConnectorAddModalProps>(
  lazy(() => import('./connector_add_modal'))
);

export const AddConnectorInline = suspendedComponentWithProps(
  lazy(() => import('./connector_add_inline'))
);

export type { ConnectorFormSchema } from '@kbn/alerts-ui-shared';
export type {
  CreateConnectorFormProps,
  CreateConnectorFormHandle,
  CreateConnectorFormStatus,
} from './create_connector_form';
