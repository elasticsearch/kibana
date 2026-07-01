/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataSourceWithSecrets } from '../../common/datasource_types';
import {
  applyAuthenticationModeToDataSource,
  getCreateDataSourceAuthenticationOptions,
  getDefaultAuthenticationMode,
  showsAuthenticationCredentialFields,
} from './create_data_source_flyout_authentication';

describe('create_data_source_flyout_authentication', () => {
  describe('getDefaultAuthenticationMode', () => {
    it('returns credentials for azure and access_and_secret_keys otherwise', () => {
      expect(getDefaultAuthenticationMode('azure')).toBe('credentials');
      expect(getDefaultAuthenticationMode('s3')).toBe('access_and_secret_keys');
      expect(getDefaultAuthenticationMode('gcs')).toBe('access_and_secret_keys');
    });
  });

  describe('getCreateDataSourceAuthenticationOptions', () => {
    it('includes Federated Identity for s3/gcs/azure', () => {
      expect(
        getCreateDataSourceAuthenticationOptions('s3', { enableFederatedIdentity: true }).map(
          (o) => o.value
        )
      ).toEqual(['access_and_secret_keys', 'federated_identity', 'anonymous']);
      expect(
        getCreateDataSourceAuthenticationOptions('gcs', { enableFederatedIdentity: true }).map(
          (o) => o.value
        )
      ).toEqual(['access_and_secret_keys', 'federated_identity', 'anonymous']);
      expect(
        getCreateDataSourceAuthenticationOptions('azure', { enableFederatedIdentity: true }).map(
          (o) => o.value
        )
      ).toEqual(['credentials', 'federated_identity', 'anonymous']);
    });

    it('omits Federated Identity when disabled', () => {
      expect(
        getCreateDataSourceAuthenticationOptions('s3', { enableFederatedIdentity: false }).map(
          (o) => o.value
        )
      ).toEqual(['access_and_secret_keys', 'anonymous']);
      expect(
        getCreateDataSourceAuthenticationOptions('gcs', { enableFederatedIdentity: false }).map(
          (o) => o.value
        )
      ).toEqual(['access_and_secret_keys', 'anonymous']);
      expect(
        getCreateDataSourceAuthenticationOptions('azure', { enableFederatedIdentity: false }).map(
          (o) => o.value
        )
      ).toEqual(['credentials', 'anonymous']);
    });
  });

  describe('showsAuthenticationCredentialFields', () => {
    it('returns true for known auth modes on s3/gcs/azure', () => {
      expect(showsAuthenticationCredentialFields('access_and_secret_keys', 's3')).toBe(true);
      expect(showsAuthenticationCredentialFields('federated_identity', 's3')).toBe(true);
      expect(showsAuthenticationCredentialFields('access_and_secret_keys', 'gcs')).toBe(true);
      expect(showsAuthenticationCredentialFields('federated_identity', 'gcs')).toBe(true);
      expect(showsAuthenticationCredentialFields('credentials', 'azure')).toBe(true);
      expect(showsAuthenticationCredentialFields('federated_identity', 'azure')).toBe(true);
    });

    it('returns false for anonymous', () => {
      expect(showsAuthenticationCredentialFields('anonymous', 's3')).toBe(false);
      expect(showsAuthenticationCredentialFields('anonymous', 'gcs')).toBe(false);
      expect(showsAuthenticationCredentialFields('anonymous', 'azure')).toBe(false);
    });
  });

  describe('applyAuthenticationModeToDataSource', () => {
    it('keeps only s3 access_key/secret_key when access_and_secret_keys selected', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: {
          auth: 'ignored',
          region: 'us-east-1',
          access_key: 'AKIA',
          secret_key: 'SECRET',
          role_arn: 'role',
          jwt_audience: 'aud',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'access_and_secret_keys');
      expect(applied.settings).toEqual(
        expect.objectContaining({
          region: 'us-east-1',
          access_key: 'AKIA',
          secret_key: 'SECRET',
        })
      );
      expect(applied.settings).not.toHaveProperty('role_arn');
      expect(applied.settings).not.toHaveProperty('jwt_audience');
      expect(applied.settings).not.toHaveProperty('auth');
    });

    it('keeps only s3 federated identity fields when federated_identity selected', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: {
          region: 'us-east-1',
          access_key: 'AKIA',
          secret_key: 'SECRET',
          role_arn: 'role',
          jwt_audience: 'aud',
          role_session_name: 'session',
          sts_endpoint: 'https://sts',
          sts_region: 'us-east-1',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'federated_identity');
      expect(applied.settings).toEqual(
        expect.objectContaining({
          region: 'us-east-1',
          role_arn: 'role',
          jwt_audience: 'aud',
          role_session_name: 'session',
          sts_endpoint: 'https://sts',
          sts_region: 'us-east-1',
        })
      );
      expect(applied.settings).not.toHaveProperty('access_key');
      expect(applied.settings).not.toHaveProperty('secret_key');
    });

    it('keeps no credentials or federated fields when anonymous selected (s3)', () => {
      const data: DataSourceWithSecrets = {
        type: 's3',
        name: 's3',
        description: '',
        settings: {
          region: 'us-east-1',
          access_key: 'AKIA',
          secret_key: 'SECRET',
          role_arn: 'role',
          jwt_audience: 'aud',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'anonymous');
      expect(applied.settings).toEqual(
        expect.objectContaining({ region: 'us-east-1', auth: 'none' })
      );
      expect(applied.settings).not.toHaveProperty('access_key');
      expect(applied.settings).not.toHaveProperty('secret_key');
      expect(applied.settings).not.toHaveProperty('role_arn');
      expect(applied.settings).not.toHaveProperty('jwt_audience');
    });

    it('trims and applies gcs credentials when access_and_secret_keys selected', () => {
      const data: DataSourceWithSecrets = {
        type: 'gcs',
        name: 'gcs',
        description: '',
        settings: {
          project_id: 'p',
          credentials: '  {"k":"v"}  ',
          jwt_audience: 'aud',
          sts_audience: 'sts',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'access_and_secret_keys');
      expect(applied.settings).toEqual(
        expect.objectContaining({
          project_id: 'p',
          credentials: '{"k":"v"}',
        })
      );
      expect(applied.settings).not.toHaveProperty('jwt_audience');
      expect(applied.settings).not.toHaveProperty('sts_audience');
    });

    it('applies gcs federated identity fields when federated_identity selected', () => {
      const data: DataSourceWithSecrets = {
        type: 'gcs',
        name: 'gcs',
        description: '',
        settings: {
          project_id: 'p',
          credentials: '{"k":"v"}',
          jwt_audience: 'aud',
          sts_audience: 'sts',
          service_account_impersonation_url: 'https://impersonate',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'federated_identity');
      expect(applied.settings).toEqual(
        expect.objectContaining({
          project_id: 'p',
          jwt_audience: 'aud',
          sts_audience: 'sts',
          service_account_impersonation_url: 'https://impersonate',
        })
      );
      expect(applied.settings).not.toHaveProperty('credentials');
    });

    it('keeps no credentials or federated fields when anonymous selected (gcs)', () => {
      const data: DataSourceWithSecrets = {
        type: 'gcs',
        name: 'gcs',
        description: '',
        settings: {
          project_id: 'p',
          credentials: '{"k":"v"}',
          jwt_audience: 'aud',
          sts_audience: 'sts',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'anonymous');
      expect(applied.settings).toEqual(expect.objectContaining({ project_id: 'p', auth: 'none' }));
      expect(applied.settings).not.toHaveProperty('credentials');
      expect(applied.settings).not.toHaveProperty('jwt_audience');
      expect(applied.settings).not.toHaveProperty('sts_audience');
    });

    it('applies azure credentials fields when credentials selected', () => {
      const data: DataSourceWithSecrets = {
        type: 'azure',
        name: 'az',
        description: '',
        settings: {
          endpoint: 'e',
          account: 'acct',
          key: 'key',
          tenant_id: 't',
          client_id: 'c',
          jwt_audience: 'aud',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'credentials');
      expect(applied.settings).toEqual(
        expect.objectContaining({
          endpoint: 'e',
          account: 'acct',
          key: 'key',
        })
      );
      expect(applied.settings).not.toHaveProperty('tenant_id');
      expect(applied.settings).not.toHaveProperty('client_id');
      expect(applied.settings).not.toHaveProperty('jwt_audience');
    });

    it('applies azure federated identity fields when federated_identity selected', () => {
      const data: DataSourceWithSecrets = {
        type: 'azure',
        name: 'az',
        description: '',
        settings: {
          endpoint: 'e',
          account: 'acct',
          key: 'key',
          tenant_id: 't',
          client_id: 'c',
          jwt_audience: 'aud',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'federated_identity');
      expect(applied.settings).toEqual(
        expect.objectContaining({
          endpoint: 'e',
          tenant_id: 't',
          client_id: 'c',
          jwt_audience: 'aud',
        })
      );
      expect(applied.settings).not.toHaveProperty('account');
      expect(applied.settings).not.toHaveProperty('key');
    });

    it('keeps no credentials or federated fields when anonymous selected (azure)', () => {
      const data: DataSourceWithSecrets = {
        type: 'azure',
        name: 'az',
        description: '',
        settings: {
          endpoint: 'https://example',
          account: 'a',
          key: 'k',
          tenant_id: 't',
          client_id: 'c',
          jwt_audience: 'aud',
        } as any,
      };

      const applied = applyAuthenticationModeToDataSource(data, 'anonymous');
      expect(applied.settings).toEqual(
        expect.objectContaining({ endpoint: 'https://example', auth: 'none' })
      );
      expect(applied.settings).not.toHaveProperty('account');
      expect(applied.settings).not.toHaveProperty('key');
      expect(applied.settings).not.toHaveProperty('tenant_id');
      expect(applied.settings).not.toHaveProperty('client_id');
      expect(applied.settings).not.toHaveProperty('jwt_audience');
    });
  });
});
