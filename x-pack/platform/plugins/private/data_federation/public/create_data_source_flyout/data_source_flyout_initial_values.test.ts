/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DataSource,
  DataSourceWithSecrets,
  S3DataSourceSettingsWithSecrets,
} from '../../common/datasource_types';
import {
  authenticationModeFromDataSource,
  dataSourceFromListItem,
  dataSourceToFlyoutFormValues,
  emptyDataSourceFlyoutFormValues,
} from './data_source_flyout_initial_values';

describe('data_source_flyout_initial_values', () => {
  describe('emptyDataSourceFlyoutFormValues', () => {
    it('returns empty name/description/settings', () => {
      expect(emptyDataSourceFlyoutFormValues()).toEqual({
        name: '',
        description: '',
        settings: {},
      });
    });
  });

  describe('dataSourceFromListItem', () => {
    it('defaults description and ensures settings is an object record', () => {
      const item: DataSource = {
        type: 's3',
        name: 'ds',
        description: '',
        settings: {},
      };

      const mapped = dataSourceFromListItem(item);
      expect(mapped.description).toBe('');
      expect(mapped.settings).toEqual({});
    });
  });

  describe('dataSourceToFlyoutFormValues', () => {
    it('maps settings values to flyout string fields', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: {
          region: 'us-east-1',
          endpoint: 'https://s3.example',
          access_key: 'AKIA',
          secret_key: 'SECRET',
        },
      };

      const values = dataSourceToFlyoutFormValues(data);
      const settings = values.settings as S3DataSourceSettingsWithSecrets;
      expect(settings.region).toBe('us-east-1');
      expect(settings.endpoint).toBe('https://s3.example');
      expect(settings.access_key).toBe('AKIA');
      expect(settings.secret_key).toBe('SECRET');
    });
  });

  describe('authenticationModeFromDataSource', () => {
    it('infers s3 federated_identity when role_arn present', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: { role_arn: 'role' },
      };
      expect(authenticationModeFromDataSource(data)).toBe('federated_identity');
    });

    it('infers s3 access_and_secret_keys when access_key present', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: { access_key: 'a' },
      };
      expect(authenticationModeFromDataSource(data)).toBe('access_and_secret_keys');
    });

    it('infers s3 anonymous when no credentials or federated identity present', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: {},
      };
      expect(authenticationModeFromDataSource(data)).toBe('anonymous');
    });

    it('infers s3 anonymous when auth is none', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: { auth: 'none' },
      };
      expect(authenticationModeFromDataSource(data)).toBe('anonymous');
    });

    it('infers gcs federated_identity when sts_audience present', () => {
      const data: DataSourceWithSecrets = {
        type: 'gcs',
        name: 'gcs',
        description: '',
        settings: { sts_audience: 'sts' },
      };
      expect(authenticationModeFromDataSource(data)).toBe('federated_identity');
    });

    it('infers gcs access_and_secret_keys when credentials present', () => {
      const data: DataSourceWithSecrets = {
        type: 'gcs',
        name: 'gcs',
        description: '',
        settings: { credentials: '{"k":"v"}' },
      };
      expect(authenticationModeFromDataSource(data)).toBe('access_and_secret_keys');
    });

    it('infers gcs anonymous when no credentials or federated identity present', () => {
      const data: DataSourceWithSecrets = {
        type: 'gcs',
        name: 'gcs',
        description: '',
        settings: {},
      };
      expect(authenticationModeFromDataSource(data)).toBe('anonymous');
    });

    it('infers azure federated_identity when tenant_id present', () => {
      const data: DataSourceWithSecrets = {
        type: 'azure',
        name: 'az',
        description: '',
        settings: { tenant_id: 't' },
      };
      expect(authenticationModeFromDataSource(data)).toBe('federated_identity');
    });

    it('infers azure anonymous when empty', () => {
      const data: DataSourceWithSecrets = {
        type: 'azure',
        name: 'az',
        description: '',
        settings: {},
      };
      expect(authenticationModeFromDataSource(data)).toBe('anonymous');
    });
  });
});
