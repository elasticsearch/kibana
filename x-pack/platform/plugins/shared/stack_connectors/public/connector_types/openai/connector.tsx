/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type {
  ActionConnectorFieldsProps,
  ConnectorFormSchema,
} from '@kbn/triggers-actions-ui-plugin/public';
import { SimpleConnectorForm } from '@kbn/triggers-actions-ui-plugin/public';
import {
  FilePickerField,
  SelectField,
  TextField,
  ToggleField,
} from '@kbn/es-ui-shared-plugin/static/forms/components';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import {
  UseArray,
  UseField,
  useFormContext,
  useFormData,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { fieldValidators } from '@kbn/es-ui-shared-plugin/static/forms/helpers';
import { OpenAiProviderType } from '@kbn/connector-schemas/openai/constants';
import * as i18nAuth from '../../common/auth/translations';
import DashboardLink from './dashboard_link';
import * as i18n from './translations';
import type { Config, Secrets } from './types';
import {
  azureAiConfig,
  azureAiSecrets,
  otherOpenAiConfig,
  getOtherOpenAiSecrets,
  openAiSecrets,
  providerOptions,
  openAiConfig,
} from './constants';
import { CRT_REQUIRED, KEY_REQUIRED } from '../../common/auth/translations';

interface OpenAIConnectorFormData extends ConnectorFormSchema<Config, Secrets> {
  __internal__?: {
    hasHeaders?: boolean;
    hasPKI?: boolean;
  };
}

const { emptyField } = fieldValidators;

const ConnectorFields: React.FC<ActionConnectorFieldsProps> = ({ readOnly, isEdit }) => {
  const { euiTheme } = useEuiTheme();
  const { getFieldDefaultValue } = useFormContext();
  const [{ config, __internal__, id, name }] = useFormData<OpenAIConnectorFormData>({
    watch: ['config.apiProvider', '__internal__.hasHeaders', '__internal__.hasPKI'],
  });
  const hasHeaders = __internal__ != null ? __internal__.hasHeaders : false;
  const hasHeadersDefaultValue = !!getFieldDefaultValue<boolean | undefined>('config.headers');
  const hasPKI = __internal__ != null ? __internal__.hasPKI : false;
  const hasPKIDefaultValue = useMemo(() => {
    return !!getFieldDefaultValue<boolean | undefined>('config.verificationMode');
  }, [getFieldDefaultValue]);

  const selectedProviderDefaultValue = useMemo(
    () =>
      getFieldDefaultValue<OpenAiProviderType>('config.apiProvider') ?? OpenAiProviderType.OpenAi,
    [getFieldDefaultValue]
  );
  const verificationModeOptions = [
    { value: 'full', text: i18n.VERIFICATION_MODE_FULL },
    { value: 'certificate', text: i18n.VERIFICATION_MODE_CERTIFICATE },
    { value: 'none', text: i18n.VERIFICATION_MODE_NONE },
  ];

  const otherOpenAiSecrets = useMemo(() => getOtherOpenAiSecrets(!hasPKI), [hasPKI]);

  return (
    <>
      <UseField
        path="config.apiProvider"
        component={SelectField}
        config={{
          label: i18n.API_PROVIDER_LABEL,
          defaultValue: selectedProviderDefaultValue,
          validations: [
            {
              validator: emptyField(i18n.API_PROVIDER_REQUIRED),
            },
          ],
        }}
        componentProps={{
          euiFieldProps: {
            'data-test-subj': 'config.apiProvider-select',
            options: providerOptions,
            fullWidth: true,
            hasNoInitialSelection: false,
            disabled: readOnly,
            readOnly,
          },
        }}
      />
      <EuiSpacer size="s" />
      {config != null && config.apiProvider === OpenAiProviderType.OpenAi && (
        <SimpleConnectorForm
          isEdit={isEdit}
          readOnly={readOnly}
          configFormSchema={openAiConfig}
          secretsFormSchema={openAiSecrets}
        />
      )}
      {/* ^v These are intentionally not if/else because of the way the `config.defaultValue` renders */}
      {config != null && config.apiProvider === OpenAiProviderType.AzureAi && (
        <SimpleConnectorForm
          isEdit={isEdit}
          readOnly={readOnly}
          configFormSchema={azureAiConfig}
          secretsFormSchema={azureAiSecrets}
        />
      )}
      {config != null && config.apiProvider === OpenAiProviderType.Other && (
        <>
          <SimpleConnectorForm
            isEdit={isEdit}
            readOnly={readOnly}
            configFormSchema={otherOpenAiConfig}
            secretsFormSchema={otherOpenAiSecrets}
          />
          <EuiSpacer size="s" />
          <UseField
            path="config.enableNativeFunctionCalling"
            component={ToggleField}
            config={{
              label: i18n.USE_NATIVE_FUNCTION_CALLING_LABEL,
              helpText: i18n.USE_NATIVE_FUNCTION_CALLING_DESC,
              defaultValue: false,
            }}
            componentProps={{
              euiFieldProps: {
                disabled: readOnly,
                'data-test-subj': 'config.enableNativeFunctionCallingSwitch',
              },
            }}
          />
          <EuiSpacer size="m" />
          <UseField
            path="__internal__.hasPKI"
            component={ToggleField}
            config={{
              defaultValue: hasPKIDefaultValue,
              label: i18n.PKI_MODE_LABEL,
            }}
            componentProps={{
              euiFieldProps: {
                disabled: readOnly,
                'data-test-subj': 'openAIViewPKISwitch',
              },
            }}
          />
          {hasPKI && (
            <>
              <EuiSpacer size="s" />
              <UseField
                path="config.verificationMode"
                component={SelectField}
                config={{
                  label: i18n.VERIFICATION_MODE_LABEL,
                  validations: [
                    {
                      validator: emptyField(CRT_REQUIRED),
                    },
                  ],
                  defaultValue: 'full',
                  helpText: i18n.VERIFICATION_MODE_DESC,
                }}
                componentProps={{
                  euiFieldProps: {
                    options: verificationModeOptions,
                    'data-test-subj': 'verificationModeSelect',
                    fullWidth: true,
                    disabled: readOnly,
                  },
                }}
              />
              <EuiSpacer size="s" />
              <UseField
                path="secrets.certificateData"
                config={{
                  label: i18n.CERT_DATA_LABEL,
                  validations: [
                    {
                      validator: emptyField(CRT_REQUIRED),
                    },
                  ],
                }}
                component={FilePickerField}
                componentProps={{
                  euiFieldProps: {
                    'data-test-subj': 'openAISSLCRTInput',
                    display: 'default',
                    accept: '.crt,.cert,.cer,.pem',
                  },
                }}
                helpText={i18n.CERT_DATA_DESC}
              />
              <UseField
                path="secrets.privateKeyData"
                config={{
                  label: i18n.KEY_DATA_LABEL,
                  validations: [
                    {
                      validator: emptyField(KEY_REQUIRED),
                    },
                  ],
                }}
                component={FilePickerField}
                componentProps={{
                  euiFieldProps: {
                    'data-test-subj': 'openAISSLKEYInput',
                    display: 'default',
                    accept: '.key,.pem',
                  },
                }}
                helpText={i18n.KEY_DATA_DESC}
              />
              <UseField
                path="secrets.caData"
                config={{
                  label: i18n.CA_DATA_LABEL,
                }}
                component={FilePickerField}
                componentProps={{
                  euiFieldProps: {
                    'data-test-subj': 'openAISSLCAInput',
                    display: 'default',
                    accept: '.crt,.cert,.cer,.pem',
                  },
                }}
                helpText={i18n.CA_DATA_DESC}
              />
            </>
          )}
        </>
      )}
      <UseField
        path="__internal__.hasHeaders"
        component={ToggleField}
        config={{
          defaultValue: hasHeadersDefaultValue,
          label: i18nAuth.HEADERS_SWITCH,
        }}
        componentProps={{
          euiFieldProps: {
            disabled: readOnly,
            'data-test-subj': 'openAIViewHeadersSwitch',
          },
        }}
      />
      {hasHeaders && (
        <UseArray path="config.headers" initialNumberOfItems={1}>
          {({ items, addItem, removeItem }) => {
            return (
              <>
                <EuiSpacer size="s" />
                <EuiTitle size="xxs" data-test-subj="openAIHeaderText">
                  <h5>{i18nAuth.HEADERS_TITLE}</h5>
                </EuiTitle>
                <EuiSpacer size="s" />
                {items.map((item) => (
                  <EuiFlexGroup key={item.id} css={{ marginTop: euiTheme.size.s }}>
                    <EuiFlexItem>
                      <UseField
                        path={`${item.path}.key`}
                        config={{
                          label: i18nAuth.KEY_LABEL,
                        }}
                        component={TextField}
                        // This is needed because when you delete
                        // a row and add a new one, the stale values will appear
                        readDefaultValueOnForm={!item.isNew}
                        componentProps={{
                          euiFieldProps: {
                            readOnly,
                            ['data-test-subj']: 'openAIHeadersKeyInput',
                            inputRef: (input: HTMLInputElement | null) => {
                              if (!readOnly && item.isNew && input) {
                                input.focus();
                              }
                            },
                          },
                        }}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <UseField
                        path={`${item.path}.value`}
                        config={{ label: i18nAuth.VALUE_LABEL }}
                        component={TextField}
                        readDefaultValueOnForm={!item.isNew}
                        componentProps={{
                          euiFieldProps: {
                            readOnly,
                            ['data-test-subj']: 'openAIHeadersValueInput',
                          },
                        }}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip content={i18nAuth.DELETE_BUTTON} disableScreenReaderOutput>
                        <EuiButtonIcon
                          color="danger"
                          onClick={() => removeItem(item.id)}
                          iconType="minusCircle"
                          aria-label={i18nAuth.DELETE_BUTTON}
                          css={{ marginTop: '28px' }}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ))}
                <EuiSpacer size="m" />
                <EuiButtonEmpty
                  iconType="plusCircle"
                  onClick={addItem}
                  data-test-subj="openAIAddHeaderButton"
                >
                  {i18nAuth.ADD_BUTTON}
                </EuiButtonEmpty>
                <EuiSpacer />
              </>
            );
          }}
        </UseArray>
      )}
      {isEdit && id && name && (
        <DashboardLink
          connectorId={id}
          connectorName={name}
          selectedProvider={selectedProviderDefaultValue}
        />
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { ConnectorFields as default };
