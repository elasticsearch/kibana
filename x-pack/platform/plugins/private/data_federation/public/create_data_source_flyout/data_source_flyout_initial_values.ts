/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataSource, DataSourceWithSecrets } from '../../common/datasource_types';
import type { CreateDataSourceAuthenticationMode } from './create_data_source_flyout_authentication';
import type { CreateDataSourceFlyoutFormValues } from './create_data_source_flyout_form_state';

export const emptyDataSourceFlyoutFormValues = (): CreateDataSourceFlyoutFormValues => ({
  name: '',
  description: '',
  settings: {},
});

/** Maps a list-table row to flyout initial state (no extra GET). */
export const dataSourceFromListItem = (item: DataSource): DataSourceWithSecrets =>
  ({
    ...item,
    description: item.description ?? '',
    settings: asSettingsRecord(item.settings),
  } as DataSourceWithSecrets);

const asSettingsRecord = (
  settings: DataSourceWithSecrets['settings'] | undefined | null
): Record<string, unknown> => {
  if (settings === undefined || settings === null || typeof settings !== 'object') {
    return {};
  }
  return settings as Record<string, unknown>;
};

const settingsToFormValues = (
  settings: DataSourceWithSecrets['settings'] | undefined | null
): CreateDataSourceFlyoutFormValues['settings'] => {
  const result: Record<string, string | boolean> = {};

  for (const [key, value] of Object.entries(asSettingsRecord(settings))) {
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'ssl' && typeof value === 'boolean') {
      result[key] = value;
      continue;
    }
    if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value);
    }
  }

  return result as CreateDataSourceFlyoutFormValues['settings'];
};

export const dataSourceToFlyoutFormValues = (
  data: DataSourceWithSecrets
): CreateDataSourceFlyoutFormValues => ({
  name: data.name,
  description: data.description ?? '',
  settings: settingsToFormValues(data.settings),
});

export const authenticationModeFromDataSource = (
  data: DataSourceWithSecrets
): CreateDataSourceAuthenticationMode => {
  const settings = asSettingsRecord(data.settings);

  if (data.type === 'azure') {
    if (typeof settings.auth === 'string' && settings.auth.trim() === 'none') {
      return 'anonymous';
    }
    const hasFederatedIdentity =
      (typeof settings.tenant_id === 'string' && settings.tenant_id.trim() !== '') ||
      (typeof settings.client_id === 'string' && settings.client_id.trim() !== '') ||
      (typeof settings.jwt_audience === 'string' && settings.jwt_audience.trim() !== '');
    if (hasFederatedIdentity) {
      return 'federated_identity';
    }
    if (
      (typeof settings.key === 'string' && settings.key.trim()) ||
      (typeof settings.account === 'string' && settings.account.trim())
    ) {
      return 'credentials';
    }
    return 'anonymous';
  }

  if (data.type === 'gcs') {
    if (typeof settings.auth === 'string' && settings.auth.trim() === 'none') {
      return 'anonymous';
    }
    const { credentials } = settings;
    const hasFederatedIdentity =
      (typeof settings.jwt_audience === 'string' && settings.jwt_audience.trim() !== '') ||
      (typeof settings.sts_audience === 'string' && settings.sts_audience.trim() !== '');
    if (hasFederatedIdentity) {
      return 'federated_identity';
    }
    const hasCredentials =
      typeof credentials === 'string'
        ? credentials.trim() !== ''
        : credentials !== undefined && credentials !== null;
    if (hasCredentials) {
      return 'access_and_secret_keys';
    }
    return 'anonymous';
  }

  if (data.type === 's3') {
    if (typeof settings.auth === 'string' && settings.auth.trim() === 'none') {
      return 'anonymous';
    }
    if (
      (typeof settings.role_arn === 'string' && settings.role_arn.trim()) ||
      (typeof settings.jwt_audience === 'string' && settings.jwt_audience.trim())
    ) {
      return 'federated_identity';
    }
    if (
      (typeof settings.access_key === 'string' && settings.access_key.trim()) ||
      (typeof settings.secret_key === 'string' && settings.secret_key.trim())
    ) {
      return 'access_and_secret_keys';
    }
    return 'anonymous';
  }

  // @ts-expect-error - typescript says this should be impossible
  throw new Error(`Unknown data source type: ${data?.type}`);
};
