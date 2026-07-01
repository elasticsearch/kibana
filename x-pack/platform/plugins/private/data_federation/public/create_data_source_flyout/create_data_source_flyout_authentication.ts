/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import type { DataSourceType, DataSourceWithSecrets } from '../../common/datasource_types';

/** S3 authentication modes (UI-only). */
export type S3AuthenticationMode = 'anonymous' | 'access_and_secret_keys' | 'federated_identity';

/** GCS authentication modes (UI-only). */
export type GcsAuthenticationMode = 'anonymous' | 'access_and_secret_keys' | 'federated_identity';

/** Azure authentication modes (UI-only; `settings.auth` is never submitted). */
export type AzureAuthenticationMode = 'anonymous' | 'credentials' | 'federated_identity';

export type CreateDataSourceAuthenticationMode =
  | S3AuthenticationMode
  | GcsAuthenticationMode
  | AzureAuthenticationMode;

export const DATA_SOURCE_TYPES_WITH_AUTHENTICATION: ReadonlySet<DataSourceType> = new Set([
  's3',
  'gcs',
  'azure',
]);

export const getDefaultAuthenticationMode = (
  dataSourceType: DataSourceType
): CreateDataSourceAuthenticationMode => {
  if (dataSourceType === 'azure') {
    return 'credentials';
  }
  return 'access_and_secret_keys';
};

export const getCreateDataSourceAuthenticationOptions = (
  dataSourceType: DataSourceType,
  { enableFederatedIdentity }: { enableFederatedIdentity?: boolean } = {}
): Array<{
  value: CreateDataSourceAuthenticationMode;
  text: string;
}> => {
  if (dataSourceType === 'azure') {
    return [
      {
        value: 'credentials',
        text: i18n.translate('xpack.dataFederation.createFlyout.authentication.azure.credentials', {
          defaultMessage: 'Credentials',
        }),
      },
      ...(enableFederatedIdentity
        ? [
            {
              value: 'federated_identity' as const,
              text: i18n.translate(
                'xpack.dataFederation.createFlyout.authentication.federatedIdentity',
                {
                  defaultMessage: 'Federated Identity',
                }
              ),
            },
          ]
        : []),
      {
        value: 'anonymous',
        text: i18n.translate('xpack.dataFederation.createFlyout.authentication.anonymous', {
          defaultMessage: 'Anonymous',
        }),
      },
    ];
  }

  if (dataSourceType === 's3') {
    return [
      {
        value: 'access_and_secret_keys',
        text: i18n.translate(
          'xpack.dataFederation.createFlyout.authentication.accessAndSecretKeys',
          {
            defaultMessage: 'Access and Secret Keys',
          }
        ),
      },
      ...(enableFederatedIdentity
        ? [
            {
              value: 'federated_identity' as const,
              text: i18n.translate(
                'xpack.dataFederation.createFlyout.authentication.federatedIdentity',
                {
                  defaultMessage: 'Federated Identity',
                }
              ),
            },
          ]
        : []),
      {
        value: 'anonymous',
        text: i18n.translate('xpack.dataFederation.createFlyout.authentication.anonymous', {
          defaultMessage: 'Anonymous',
        }),
      },
    ];
  }

  if (dataSourceType === 'gcs') {
    return [
      {
        value: 'access_and_secret_keys',
        text: i18n.translate(
          'xpack.dataFederation.createFlyout.authentication.accessAndSecretKeys',
          {
            defaultMessage: 'Access and Secret Keys',
          }
        ),
      },
      ...(enableFederatedIdentity
        ? [
            {
              value: 'federated_identity' as const,
              text: i18n.translate(
                'xpack.dataFederation.createFlyout.authentication.federatedIdentity',
                {
                  defaultMessage: 'Federated Identity',
                }
              ),
            },
          ]
        : []),
      {
        value: 'anonymous',
        text: i18n.translate('xpack.dataFederation.createFlyout.authentication.anonymous', {
          defaultMessage: 'Anonymous',
        }),
      },
    ];
  }

  return [
    {
      value: 'access_and_secret_keys',
      text: i18n.translate('xpack.dataFederation.createFlyout.authentication.accessAndSecretKeys', {
        defaultMessage: 'Access and Secret Keys',
      }),
    },
    {
      value: 'anonymous',
      text: i18n.translate('xpack.dataFederation.createFlyout.authentication.anonymous', {
        defaultMessage: 'Anonymous',
      }),
    },
  ];
};

export const showsAuthenticationCredentialFields = (
  mode: CreateDataSourceAuthenticationMode,
  dataSourceType: DataSourceType
): boolean => {
  if (dataSourceType === 'azure') {
    return mode === 'credentials' || mode === 'federated_identity';
  }
  if (dataSourceType === 's3') {
    return mode === 'access_and_secret_keys' || mode === 'federated_identity';
  }
  if (dataSourceType === 'gcs') {
    return mode === 'access_and_secret_keys' || mode === 'federated_identity';
  }
  return mode === 'access_and_secret_keys';
};

export const createDataSourceFlyoutAuthenticationLabel = (): string =>
  i18n.translate('xpack.dataFederation.createFlyout.authentication.label', {
    defaultMessage: 'Preferred method',
  });

export const createDataSourceFlyoutAuthenticationTitle = (): string =>
  i18n.translate('xpack.dataFederation.createFlyout.authentication.title', {
    defaultMessage: 'Authentication',
  });

export const createDataSourceFlyoutAuthenticationHelpAriaLabel = (): string =>
  i18n.translate('xpack.dataFederation.createFlyout.authentication.helpAriaLabel', {
    defaultMessage: 'Open Cloud security documentation',
  });

/** Applies UI authentication mode to the payload submitted to the API. */
export const applyAuthenticationModeToDataSource = (
  data: DataSourceWithSecrets,
  mode: CreateDataSourceAuthenticationMode
): DataSourceWithSecrets => {
  const authSettings = mode === 'anonymous' ? { auth: 'none' } : {};

  switch (data.type) {
    case 's3': {
      const {
        access_key: _accessKey,
        secret_key: _secretKey,
        role_arn: _roleArn,
        jwt_audience: _jwtAudience,
        role_session_name: _roleSessionName,
        sts_endpoint: _stsEndpoint,
        sts_region: _stsRegion,
        auth: _auth,
        ...rest
      } = data.settings;

      let applied: Record<string, unknown> = {};
      if (mode === 'access_and_secret_keys') {
        applied = { access_key: data.settings.access_key, secret_key: data.settings.secret_key };
      } else if (mode === 'federated_identity') {
        applied = {
          role_arn: data.settings.role_arn,
          jwt_audience: data.settings.jwt_audience,
          role_session_name: data.settings.role_session_name,
          sts_endpoint: data.settings.sts_endpoint,
          sts_region: data.settings.sts_region,
        };
      }

      return {
        ...data,
        settings: {
          ...rest,
          ...authSettings,
          ...applied,
        },
      };
    }
    case 'gcs': {
      const {
        credentials: _credentials,
        jwt_audience: _jwtAudience,
        sts_audience: _stsAudience,
        service_account_impersonation_url: _serviceAccountImpersonationUrl,
        auth: _auth,
        ...rest
      } = data.settings;
      const credentialsText = data.settings.credentials?.trim();

      let applied: Record<string, unknown> = {};
      if (mode === 'access_and_secret_keys' && credentialsText) {
        applied = { credentials: credentialsText };
      } else if (mode === 'federated_identity') {
        applied = {
          jwt_audience: data.settings.jwt_audience,
          sts_audience: data.settings.sts_audience,
          service_account_impersonation_url: data.settings.service_account_impersonation_url,
        };
      }
      return {
        ...data,
        settings: {
          ...rest,
          ...authSettings,
          ...applied,
        },
      };
    }
    case 'azure': {
      const {
        account: _account,
        key: _key,
        tenant_id: _tenantId,
        client_id: _clientId,
        jwt_audience: _jwtAudience,
        auth: _auth,
        ...rest
      } = data.settings;

      const base = { ...rest };

      if (mode === 'credentials') {
        return {
          ...data,
          settings: {
            ...base,
            account: data.settings.account,
            key: data.settings.key,
          },
        };
      }
      if (mode === 'federated_identity') {
        return {
          ...data,
          settings: {
            ...base,
            tenant_id: data.settings.tenant_id,
            client_id: data.settings.client_id,
            jwt_audience: data.settings.jwt_audience,
          },
        };
      }
      return {
        ...data,
        settings: {
          ...base,
          ...authSettings,
        },
      };
    }
    default:
      return data;
  }
};
