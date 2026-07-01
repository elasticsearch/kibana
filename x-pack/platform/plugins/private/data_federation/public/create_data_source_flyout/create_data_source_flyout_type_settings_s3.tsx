/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonEmpty,
  EuiFieldPassword,
  EuiFieldText,
  EuiFormRow,
  EuiSpacer,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type { UseFormUnregister } from 'react-hook-form';
import { type Control, useController } from 'react-hook-form';
import type { CreateDataSourceFlyoutFormValues } from './create_data_source_flyout_form_state';
import type { FederatedIdentityClusterInfo } from './federated_identity_cluster_info';
import { FederatedIdentityClusterInfoFields } from './federated_identity_cluster_info_fields';

export function CreateDataSourceFlyoutTypeSettingsS3({
  control,
  unregister,
}: {
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
}) {
  const { field: regionField } = useController({
    name: 'settings.region',
    control,
  });
  const { field: endpointField } = useController({
    name: 'settings.endpoint',
    control,
  });

  useEffect(() => {
    return () => {
      unregister('settings.region');
      unregister('settings.endpoint');
    };
  }, [unregister]);

  return (
    <>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.region', {
          defaultMessage: 'Region',
        })}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutS3Region"
          fullWidth
          autoComplete="off"
          value={regionField.value}
          onChange={(e) => regionField.onChange(e.target.value)}
          name={regionField.name}
          inputRef={regionField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.endpoint', {
          defaultMessage: 'Endpoint',
        })}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutS3Endpoint"
          fullWidth
          autoComplete="off"
          value={endpointField.value}
          onChange={(e) => endpointField.onChange(e.target.value)}
          name={endpointField.name}
          inputRef={endpointField.ref}
        />
      </EuiFormRow>
    </>
  );
}

export function CreateDataSourceFlyoutTypeSettingsS3Credentials({
  control,
  unregister,
  areCredentialsRequired,
}: {
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
  areCredentialsRequired: boolean;
}) {
  const { field: accessKeyField, fieldState: accessKeyState } = useController({
    name: 'settings.access_key',
    control,
    rules: areCredentialsRequired
      ? {
          validate: (value?: string) =>
            value?.trim()
              ? true
              : i18n.translate('xpack.dataFederation.createFlyout.s3.fields.accessKeyRequired', {
                  defaultMessage: 'Access key is required.',
                }),
        }
      : undefined,
  });
  const { field: secretKeyField, fieldState: secretKeyState } = useController({
    name: 'settings.secret_key',
    control,
    rules: areCredentialsRequired
      ? {
          validate: (value?: string) =>
            value?.trim()
              ? true
              : i18n.translate('xpack.dataFederation.createFlyout.s3.fields.secretKeyRequired', {
                  defaultMessage: 'Secret key is required.',
                }),
        }
      : undefined,
  });

  useEffect(() => {
    return () => {
      unregister('settings.access_key');
      unregister('settings.secret_key');
    };
  }, [unregister]);

  return (
    <>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.accessKey', {
          defaultMessage: 'Access key',
        })}
        fullWidth
        isInvalid={Boolean(accessKeyState.error)}
        error={accessKeyState.error?.message}
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutS3AccessKey"
          fullWidth
          autoComplete="off"
          isInvalid={Boolean(accessKeyState.error)}
          value={accessKeyField.value}
          onChange={(e) => accessKeyField.onChange(e.target.value)}
          name={accessKeyField.name}
          inputRef={accessKeyField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.secretKey', {
          defaultMessage: 'Secret key',
        })}
        fullWidth
        isInvalid={Boolean(secretKeyState.error)}
        error={secretKeyState.error?.message}
      >
        <EuiFieldPassword
          type="dual"
          data-test-subj="createDataSourceFlyoutS3SecretKey"
          fullWidth
          autoComplete="off"
          isInvalid={Boolean(secretKeyState.error)}
          value={secretKeyField.value}
          onChange={(e) => secretKeyField.onChange(e.target.value)}
          name={secretKeyField.name}
          inputRef={secretKeyField.ref}
        />
      </EuiFormRow>
    </>
  );
}

export function CreateDataSourceFlyoutTypeSettingsS3FederatedIdentity({
  control,
  cloudInfo,
  unregister,
  areFieldsRequired,
}: {
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  cloudInfo?: FederatedIdentityClusterInfo;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
  areFieldsRequired: boolean;
}) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const advancedId = useGeneratedHtmlId({ prefix: 'createDataSourceFlyoutS3FederatedAdvanced' });

  const { field: roleArnField, fieldState: roleArnState } = useController({
    name: 'settings.role_arn',
    control,
    rules: areFieldsRequired
      ? {
          validate: (value?: string) =>
            value?.trim()
              ? true
              : i18n.translate('xpack.dataFederation.createFlyout.s3.fields.roleArnRequired', {
                  defaultMessage: 'Role ARN is required.',
                }),
        }
      : undefined,
  });

  const { field: jwtAudienceField, fieldState: jwtAudienceState } = useController({
    name: 'settings.jwt_audience',
    control,
  });

  const { field: roleSessionNameField } = useController({
    name: 'settings.role_session_name',
    control,
  });
  const { field: stsEndpointField } = useController({
    name: 'settings.sts_endpoint',
    control,
  });
  const { field: stsRegionField } = useController({
    name: 'settings.sts_region',
    control,
  });

  useEffect(() => {
    return () => {
      unregister('settings.role_arn');
      unregister('settings.jwt_audience');
      unregister('settings.role_session_name');
      unregister('settings.sts_endpoint');
      unregister('settings.sts_region');
    };
  }, [unregister]);

  return (
    <>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.roleArn', {
          defaultMessage: 'Role ARN',
        })}
        fullWidth
        isInvalid={Boolean(roleArnState.error)}
        error={roleArnState.error?.message}
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutS3FederatedRoleArn"
          fullWidth
          autoComplete="off"
          isInvalid={Boolean(roleArnState.error)}
          value={roleArnField.value}
          onChange={(e) => roleArnField.onChange(e.target.value)}
          name={roleArnField.name}
          inputRef={roleArnField.ref}
        />
      </EuiFormRow>
      <FederatedIdentityClusterInfoFields cloudInfo={cloudInfo} />
      <EuiButtonEmpty
        size="s"
        flush="left"
        iconType={isAdvancedOpen ? 'arrowDown' : 'arrowRight'}
        aria-expanded={isAdvancedOpen}
        aria-controls={advancedId}
        onClick={() => setIsAdvancedOpen((value) => !value)}
        data-test-subj="createDataSourceFlyoutS3FederatedAdvancedToggle"
      >
        {isAdvancedOpen
          ? i18n.translate('xpack.dataFederation.createFlyout.s3.federated.advanced.hide', {
              defaultMessage: 'Hide optional authentication settings',
            })
          : i18n.translate('xpack.dataFederation.createFlyout.s3.federated.advanced.show', {
              defaultMessage: 'Show optional authentication settings',
            })}
      </EuiButtonEmpty>
      <div id={advancedId} hidden={!isAdvancedOpen}>
        <EuiSpacer size="s" />
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.jwtAudience', {
            defaultMessage: 'JWT audience',
          })}
          fullWidth
          isInvalid={Boolean(jwtAudienceState.error)}
          error={jwtAudienceState.error?.message}
        >
          <EuiFieldText
            data-test-subj="createDataSourceFlyoutS3FederatedJwtAudience"
            fullWidth
            autoComplete="off"
            isInvalid={Boolean(jwtAudienceState.error)}
            value={jwtAudienceField.value}
            onChange={(e) => jwtAudienceField.onChange(e.target.value)}
            name={jwtAudienceField.name}
            inputRef={jwtAudienceField.ref}
          />
        </EuiFormRow>
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.roleSessionName', {
            defaultMessage: 'Role session name',
          })}
          fullWidth
        >
          <EuiFieldText
            data-test-subj="createDataSourceFlyoutS3FederatedRoleSessionName"
            fullWidth
            autoComplete="off"
            value={roleSessionNameField.value}
            onChange={(e) => roleSessionNameField.onChange(e.target.value)}
            name={roleSessionNameField.name}
            inputRef={roleSessionNameField.ref}
          />
        </EuiFormRow>
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.stsEndpoint', {
            defaultMessage: 'STS endpoint',
          })}
          fullWidth
        >
          <EuiFieldText
            data-test-subj="createDataSourceFlyoutS3FederatedStsEndpoint"
            fullWidth
            autoComplete="off"
            value={stsEndpointField.value}
            onChange={(e) => stsEndpointField.onChange(e.target.value)}
            name={stsEndpointField.name}
            inputRef={stsEndpointField.ref}
          />
        </EuiFormRow>
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.createFlyout.s3.fields.stsRegion', {
            defaultMessage: 'STS region',
          })}
          fullWidth
        >
          <EuiFieldText
            data-test-subj="createDataSourceFlyoutS3FederatedStsRegion"
            fullWidth
            autoComplete="off"
            value={stsRegionField.value}
            onChange={(e) => stsRegionField.onChange(e.target.value)}
            name={stsRegionField.name}
            inputRef={stsRegionField.ref}
          />
        </EuiFormRow>
      </div>
    </>
  );
}
