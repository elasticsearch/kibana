/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButtonEmpty,
  EuiFieldText,
  EuiFormRow,
  EuiSpacer,
  EuiTextArea,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type { UseFormUnregister } from 'react-hook-form';
import { type Control, useController } from 'react-hook-form';
import type { CreateDataSourceFlyoutFormValues } from './create_data_source_flyout_form_state';

export function CreateDataSourceFlyoutTypeSettingsGcs({
  control,
  unregister,
}: {
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
}) {
  const { field: projectIdField } = useController({
    name: 'settings.project_id',
    control,
  });
  const { field: endpointField } = useController({
    name: 'settings.endpoint',
    control,
  });
  const { field: tokenUriField } = useController({
    name: 'settings.token_uri',
    control,
  });

  useEffect(() => {
    return () => {
      unregister('settings.project_id');
      unregister('settings.endpoint');
      unregister('settings.token_uri');
    };
  }, [unregister]);

  return (
    <>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.projectId', {
          defaultMessage: 'Project ID',
        })}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutGcsProjectId"
          fullWidth
          autoComplete="off"
          value={projectIdField.value}
          onChange={(e) => projectIdField.onChange(e.target.value)}
          name={projectIdField.name}
          inputRef={projectIdField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.endpoint', {
          defaultMessage: 'Endpoint',
        })}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutGcsEndpoint"
          fullWidth
          autoComplete="off"
          value={endpointField.value}
          onChange={(e) => endpointField.onChange(e.target.value)}
          name={endpointField.name}
          inputRef={endpointField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.tokenUri', {
          defaultMessage: 'Token URI',
        })}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutGcsTokenUri"
          fullWidth
          autoComplete="off"
          value={tokenUriField.value}
          onChange={(e) => tokenUriField.onChange(e.target.value)}
          name={tokenUriField.name}
          inputRef={tokenUriField.ref}
        />
      </EuiFormRow>
    </>
  );
}

export function CreateDataSourceFlyoutTypeSettingsGcsCredentials({
  control,
  unregister,
  areCredentialsRequired,
}: {
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
  areCredentialsRequired: boolean;
}) {
  const { field: credentialsField, fieldState: credentialsState } = useController({
    name: 'settings.credentials',
    control,
    rules: areCredentialsRequired
      ? {
          validate: (value?: string) =>
            value?.trim()
              ? true
              : i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.credentialsRequired', {
                  defaultMessage: 'Credentials are required.',
                }),
        }
      : undefined,
  });

  useEffect(() => {
    return () => {
      unregister('settings.credentials');
    };
  }, [unregister]);

  return (
    <EuiFormRow
      label={i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.credentials', {
        defaultMessage: 'Credentials',
      })}
      fullWidth
      isInvalid={Boolean(credentialsState.error)}
      error={credentialsState.error?.message}
    >
      <EuiTextArea
        data-test-subj="createDataSourceFlyoutGcsCredentials"
        fullWidth
        rows={3}
        autoComplete="off"
        isInvalid={Boolean(credentialsState.error)}
        value={credentialsField.value ?? ''}
        onChange={(e) => credentialsField.onChange(e.target.value)}
        name={credentialsField.name}
        inputRef={credentialsField.ref}
      />
    </EuiFormRow>
  );
}

export function CreateDataSourceFlyoutTypeSettingsGcsFederatedIdentity({
  control,
  unregister,
  areFieldsRequired,
}: {
  control: Control<CreateDataSourceFlyoutFormValues, any>;
  unregister: UseFormUnregister<CreateDataSourceFlyoutFormValues>;
  areFieldsRequired: boolean;
}) {
  const [isOptionalOpen, setIsOptionalOpen] = useState(false);
  const optionalId = useGeneratedHtmlId({
    prefix: 'createDataSourceFlyoutGcsFederatedOptionalSettings',
  });

  const { field: jwtAudienceField, fieldState: jwtAudienceState } = useController({
    name: 'settings.jwt_audience',
    control,
  });

  const { field: stsAudienceField, fieldState: stsAudienceState } = useController({
    name: 'settings.sts_audience',
    control,
    rules: areFieldsRequired
      ? {
          validate: (value?: string) =>
            value?.trim()
              ? true
              : i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.stsAudienceRequired', {
                  defaultMessage: 'STS audience is required.',
                }),
        }
      : undefined,
  });

  const { field: impersonationUrlField } = useController({
    name: 'settings.service_account_impersonation_url',
    control,
  });

  const hasOptionalError = useMemo(() => Boolean(jwtAudienceState.error), [jwtAudienceState.error]);

  useEffect(() => {
    if (hasOptionalError) {
      setIsOptionalOpen(true);
    }
  }, [hasOptionalError]);

  useEffect(() => {
    return () => {
      unregister('settings.jwt_audience');
      unregister('settings.sts_audience');
      unregister('settings.service_account_impersonation_url');
    };
  }, [unregister]);

  return (
    <>
      <EuiFormRow
        label={i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.stsAudience', {
          defaultMessage: 'STS audience',
        })}
        fullWidth
        isInvalid={Boolean(stsAudienceState.error)}
        error={stsAudienceState.error?.message}
      >
        <EuiFieldText
          data-test-subj="createDataSourceFlyoutGcsFederatedStsAudience"
          fullWidth
          autoComplete="off"
          isInvalid={Boolean(stsAudienceState.error)}
          value={stsAudienceField.value}
          onChange={(e) => stsAudienceField.onChange(e.target.value)}
          name={stsAudienceField.name}
          inputRef={stsAudienceField.ref}
        />
      </EuiFormRow>
      <EuiButtonEmpty
        size="s"
        flush="left"
        iconType={isOptionalOpen ? 'arrowDown' : 'arrowRight'}
        aria-expanded={isOptionalOpen}
        aria-controls={optionalId}
        onClick={() => setIsOptionalOpen((value) => !value)}
        data-test-subj="createDataSourceFlyoutGcsFederatedOptionalToggle"
      >
        {isOptionalOpen
          ? i18n.translate('xpack.dataFederation.createFlyout.gcs.federated.optional.hide', {
              defaultMessage: 'Hide optional authentication settings',
            })
          : i18n.translate('xpack.dataFederation.createFlyout.gcs.federated.optional.show', {
              defaultMessage: 'Show optional authentication settings',
            })}
      </EuiButtonEmpty>
      <div id={optionalId} hidden={!isOptionalOpen}>
        <EuiSpacer size="s" />
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.createFlyout.gcs.fields.jwtAudience', {
            defaultMessage: 'JWT audience',
          })}
          fullWidth
          isInvalid={Boolean(jwtAudienceState.error)}
          error={jwtAudienceState.error?.message}
        >
          <EuiFieldText
            data-test-subj="createDataSourceFlyoutGcsFederatedJwtAudience"
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
          label={i18n.translate(
            'xpack.dataFederation.createFlyout.gcs.fields.serviceAccountImpersonationUrl',
            {
              defaultMessage: 'Service account impersonation URL',
            }
          )}
          fullWidth
        >
          <EuiFieldText
            data-test-subj="createDataSourceFlyoutGcsFederatedServiceAccountImpersonationUrl"
            fullWidth
            autoComplete="off"
            value={impersonationUrlField.value}
            onChange={(e) => impersonationUrlField.onChange(e.target.value)}
            name={impersonationUrlField.name}
            inputRef={impersonationUrlField.ref}
          />
        </EuiFormRow>
      </div>
    </>
  );
}
