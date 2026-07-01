/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';

import type { Control, UseFormUnregister } from 'react-hook-form';
import type { DataSourceType } from '../../common/datasource_types';
import type { CreateDataSourceFlyoutFormValues } from './create_data_source_flyout_form_state';
import type { FederatedIdentityClusterInfo } from './federated_identity_cluster_info';
import {
  DATA_SOURCE_TYPES_WITH_AUTHENTICATION,
  showsAuthenticationCredentialFields,
  type AzureAuthenticationMode,
  type CreateDataSourceAuthenticationMode,
} from './create_data_source_flyout_authentication';
import { CreateDataSourceFlyoutTypeSettingsAzureAuthenticationFields } from './create_data_source_flyout_type_settings_azure';
import {
  CreateDataSourceFlyoutTypeSettingsGcsCredentials,
  CreateDataSourceFlyoutTypeSettingsGcsFederatedIdentity,
} from './create_data_source_flyout_type_settings_gcs';
import {
  CreateDataSourceFlyoutTypeSettingsS3Credentials,
  CreateDataSourceFlyoutTypeSettingsS3FederatedIdentity,
} from './create_data_source_flyout_type_settings_s3';

export function CreateDataSourceFlyoutAuthenticationFields({
  authenticationMode,
  cloudInfo,
  dataSourceType,
  requireS3Credentials,
  requireS3FederatedIdentity,
  requireGcsCredentials,
  requireGcsFederatedIdentity,
  requireAzureCredentials,
  control,
  unregister,
}: {
  authenticationMode: CreateDataSourceAuthenticationMode;
  cloudInfo?: FederatedIdentityClusterInfo;
  dataSourceType: DataSourceType;
  requireS3Credentials: boolean;
  requireS3FederatedIdentity: boolean;
  requireGcsCredentials: boolean;
  requireGcsFederatedIdentity: boolean;
  requireAzureCredentials: boolean;
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
}) {
  if (
    !DATA_SOURCE_TYPES_WITH_AUTHENTICATION.has(dataSourceType) ||
    !showsAuthenticationCredentialFields(authenticationMode, dataSourceType)
  ) {
    return null;
  }

  return (
    <>
      <EuiSpacer size="m" />
      <div>
        {dataSourceType === 's3' && authenticationMode === 'access_and_secret_keys' ? (
          <CreateDataSourceFlyoutTypeSettingsS3Credentials
            control={control}
            unregister={unregister}
            areCredentialsRequired={requireS3Credentials}
          />
        ) : null}
        {dataSourceType === 's3' && authenticationMode === 'federated_identity' ? (
          <CreateDataSourceFlyoutTypeSettingsS3FederatedIdentity
            control={control}
            cloudInfo={cloudInfo}
            unregister={unregister}
            areFieldsRequired={requireS3FederatedIdentity}
          />
        ) : null}
        {dataSourceType === 'gcs' && authenticationMode === 'access_and_secret_keys' ? (
          <CreateDataSourceFlyoutTypeSettingsGcsCredentials
            control={control}
            unregister={unregister}
            areCredentialsRequired={requireGcsCredentials}
          />
        ) : null}
        {dataSourceType === 'gcs' && authenticationMode === 'federated_identity' ? (
          <CreateDataSourceFlyoutTypeSettingsGcsFederatedIdentity
            control={control}
            unregister={unregister}
            areFieldsRequired={requireGcsFederatedIdentity}
          />
        ) : null}
        {dataSourceType === 'azure' ? (
          <CreateDataSourceFlyoutTypeSettingsAzureAuthenticationFields
            authenticationMode={authenticationMode as AzureAuthenticationMode}
            areFieldsRequired={requireAzureCredentials}
            control={control}
            unregister={unregister}
          />
        ) : null}
      </div>
    </>
  );
}
