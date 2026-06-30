/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExclusiveUnion } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiCheckableCard,
  EuiCopy,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  htmlIdGenerator,
  useEuiTheme,
  useIsWithinBreakpoints,
} from '@elastic/eui';
import { Form, FormikProvider, useFormik } from 'formik';
import moment from 'moment-timezone';
import type { FunctionComponent } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import useAsyncFn from 'react-use/lib/useAsyncFn';

import { CodeEditorField } from '@kbn/code-editor';
import type { AuthenticatedUser, CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { FormattedDate, FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { KibanaServerError } from '@kbn/kibana-utils-plugin/public';
import { FormField, FormRow } from '@kbn/security-form-components';
import type {
  ApiKeyRoleDescriptors,
  CategorizedApiKey,
  Role,
} from '@kbn/security-plugin-types-common';

import { ApiKeyBadge, ApiKeyStatus, TimeToolTip } from '.';
import { APIKeysAPIClient } from './api_keys_api_client';
import type {
  CreateAPIKeyParams,
  CreateAPIKeyResult,
  UpdateAPIKeyParams,
  UpdateAPIKeyResult,
} from './api_keys_api_client';

const TypeLabel = () => (
  <FormattedMessage
    id="xpack.security.accountManagement.apiKeyFlyout.typeLabel"
    defaultMessage="Type"
  />
);

const NameLabel = () => (
  <FormattedMessage
    id="xpack.security.accountManagement.apiKeyFlyout.nameLabel"
    defaultMessage="Name"
  />
);

const invalidJsonError = i18n.translate(
  'xpack.security.management.apiKeys.apiKeyFlyout.invalidJsonError',
  {
    defaultMessage: 'Enter valid JSON.',
  }
);

export interface ApiKeyFormValues {
  name: string;
  type: string;
  expiration: string;
  customExpiration: boolean;
  customPrivileges: boolean;
  includeMetadata: boolean;
  includeCertificateIdentity: boolean;
  access: string;
  role_descriptors: string;
  metadata: string;
  certificateIdentity: string;
}

interface CommonApiKeyFlyoutProps {
  initialValues?: ApiKeyFormValues;
  onCancel(): void;
  canManageCrossClusterApiKeys?: boolean;
  readOnly?: boolean;
  http?: CoreStart['http'];
  currentUser?: AuthenticatedUser;
  isLoadingCurrentUser?: boolean;
  defaultName?: string;
  defaultMetadata?: string;
  defaultRoleDescriptors?: string;
  defaultExpiration?: string;
}

interface CreateApiKeyFlyoutProps extends CommonApiKeyFlyoutProps {
  onSuccess?: (createApiKeyResponse: CreateAPIKeyResult, type?: ApiKeyFormValues['type']) => void;
}

interface UpdateApiKeyFlyoutProps extends CommonApiKeyFlyoutProps {
  onSuccess?: (updateApiKeyResponse: UpdateAPIKeyResult, type?: ApiKeyFormValues['type']) => void;
  apiKey: CategorizedApiKey;
}

export type ApiKeyFlyoutProps = ExclusiveUnion<CreateApiKeyFlyoutProps, UpdateApiKeyFlyoutProps>;

const defaultInitialValues: ApiKeyFormValues = {
  name: '',
  type: 'rest',
  expiration: '',
  includeMetadata: false,
  includeCertificateIdentity: false,
  metadata: '{}',
  certificateIdentity: '',
  customExpiration: false,
  customPrivileges: false,
  access: JSON.stringify(
    {
      search: [
        {
          names: ['*'],
        },
      ],
      replication: [
        {
          names: ['*'],
        },
      ],
    },
    null,
    2
  ),
  role_descriptors: '{}',
};

const READ_ONLY_BOILERPLATE = `{
  "read-only-role": {
    "cluster": [],
    "indices": [
      {
        "names": ["*"],
        "privileges": ["read"]
      }
    ]
  }
}`;
const WRITE_ONLY_BOILERPLATE = `{
  "write-only-role": {
    "cluster": [],
    "indices": [
      {
        "names": ["*"],
        "privileges": ["write"]
      }
    ]
  }
}`;

const httpErrorText = i18n.translate('xpack.security.httpError', {
  defaultMessage: 'Could not initialize http client.',
});

/**
 * Renders a cross-cluster API key certificate identity in the details overview with the ability to
 * reveal/hide the value and copy it to the clipboard.
 */
const CertificateIdentityValue: FunctionComponent<{ value: string }> = ({ value }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="xs" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText
          size="xs"
          data-test-subj="apiKeyCertificateIdentityValue"
          style={{ wordBreak: 'break-all' }}
        >
          {isVisible ? value : '•'.repeat(Math.min(value.length, 24))}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonIcon
          iconType={isVisible ? 'eyeClosed' : 'eye'}
          data-test-subj="apiKeyCertificateIdentityToggle"
          aria-label={
            isVisible
              ? i18n.translate(
                  'xpack.security.accountManagement.apiKeyFlyout.certificateIdentityHideLabel',
                  { defaultMessage: 'Hide certificate identity' }
                )
              : i18n.translate(
                  'xpack.security.accountManagement.apiKeyFlyout.certificateIdentityShowLabel',
                  { defaultMessage: 'Show certificate identity' }
                )
          }
          onClick={() => setIsVisible((visible) => !visible)}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiCopy textToCopy={value}>
          {(copy) => (
            <EuiButtonIcon
              iconType="copyClipboard"
              data-test-subj="apiKeyCertificateIdentityCopy"
              aria-label={i18n.translate(
                'xpack.security.accountManagement.apiKeyFlyout.certificateIdentityCopyLabel',
                { defaultMessage: 'Copy certificate identity' }
              )}
              onClick={copy}
            />
          )}
        </EuiCopy>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const ApiKeyFlyout: FunctionComponent<ApiKeyFlyoutProps> = ({
  onSuccess,
  onCancel,
  defaultExpiration,
  defaultMetadata,
  defaultRoleDescriptors,
  defaultName,
  apiKey,
  canManageCrossClusterApiKeys = false,
  readOnly = false,
  currentUser,
  isLoadingCurrentUser,
}) => {
  const { euiTheme } = useEuiTheme();
  const isFullWidth = useIsWithinBreakpoints(['xs', 's', 'm']);
  const flyoutSize = isFullWidth ? 'full' : 'm';
  const {
    services: { http, docLinks },
  } = useKibana();
  const [responseError, setResponseError] = useState<KibanaServerError | undefined>(undefined);
  const [{ value: roles, loading: isLoadingRoles }, getRoles] = useAsyncFn(() => {
    if (http) {
      return http.get<Role[]>('/api/security/role');
    }
    return Promise.resolve([]);
  }, [http]);

  const formik = useFormik<ApiKeyFormValues>({
    onSubmit: async (values) => {
      if (http) {
        try {
          if (apiKey) {
            const updateApiKeyResponse = await new APIKeysAPIClient(http).updateApiKey(
              mapUpdateApiKeyValues(apiKey.type, apiKey.id, values, formik.initialValues)
            );

            onSuccess?.(updateApiKeyResponse, apiKey.type);
          } else {
            const createApiKeyResponse = await new APIKeysAPIClient(http).createApiKey(
              mapCreateApiKeyValues(values)
            );

            onSuccess?.(createApiKeyResponse, values.type);
          }
          setResponseError(undefined);
        } catch (error) {
          setResponseError(error.body);
          throw error;
        }
      } else {
        setResponseError({ message: httpErrorText, statusCode: 0 });
        throw new Error(httpErrorText);
      }
    },
    initialValues: apiKey ? mapApiKeyFormValues(apiKey) : defaultInitialValues,
  });

  useEffect(() => {
    getRoles();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUser && roles) {
      const userPermissions = currentUser.roles.reduce<ApiKeyRoleDescriptors>(
        (accumulator, roleName) => {
          const role = roles.find((r) => r.name === roleName);
          if (role) {
            accumulator[role.name] = role.elasticsearch;
          }
          return accumulator;
        },
        {}
      );

      if (!formik.touched.role_descriptors && !apiKey) {
        formik.setFieldValue('role_descriptors', JSON.stringify(userPermissions, null, 2));
      }
    }
  }, [currentUser, roles]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultRoleDescriptors && !apiKey) {
      formik.setFieldValue('role_descriptors', defaultRoleDescriptors);
    }
  }, [defaultRoleDescriptors]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultName && !apiKey) {
      formik.setFieldValue('name', defaultName);
    }
  }, [defaultName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultMetadata && !apiKey) {
      formik.setFieldValue('metadata', defaultMetadata);
    }
  }, [defaultMetadata]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultExpiration && !apiKey) {
      formik.setFieldValue('expiration', defaultExpiration);
      formik.setFieldValue('customExpiration', true);
    }
  }, [defaultExpiration]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = isLoadingCurrentUser || isLoadingRoles;

  const isOwner = currentUser && apiKey ? currentUser.username === apiKey.username : false;
  const hasExpired = apiKey ? apiKey.expiration && moment(apiKey.expiration).isBefore() : false;
  const canEdit = isOwner && !hasExpired;

  // autofocus first field when loaded
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    requestAnimationFrame(() => {
      if (inputRef?.current) {
        inputRef?.current.focus();
      }
    });
  }, [isLoading]);

  const titleId = htmlIdGenerator('formFlyout')('title');
  const isSubmitButtonHidden = readOnly || (apiKey && !canEdit);

  const isSubmitDisabled =
    isLoading || (formik.submitCount > 0 && !formik.isValid) || readOnly || (apiKey && !canEdit);

  const title = apiKey
    ? readOnly || !canEdit
      ? i18n.translate('xpack.security.accountManagement.apiKeyFlyout.viewTitle', {
          defaultMessage: `API key details`,
        })
      : i18n.translate('xpack.security.accountManagement.apiKeyFlyout.updateTitle', {
          defaultMessage: `Update API key`,
        })
    : i18n.translate('xpack.security.accountManagement.apiKeyFlyout.createTitle', {
        defaultMessage: `Create API key`,
      });

  const submitButtonText = apiKey
    ? i18n.translate('xpack.security.accountManagement.apiKeyFlyout.updateSubmitButton', {
        defaultMessage: `{isSubmitting, select, true{Updating API key…} other{Update API key}}`,
        values: { isSubmitting: formik.isSubmitting },
      })
    : i18n.translate('xpack.security.accountManagement.apiKeyFlyout.createSubmitButton', {
        defaultMessage: `{isSubmitting, select, true{Creating API key…} other{Create API key}}`,
        values: { isSubmitting: formik.isSubmitting },
      });

  let expirationDate: Date | undefined;
  if (formik.values.customExpiration) {
    expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + parseInt(formik.values.expiration, 10));
  }

  return (
    <FormikProvider value={formik}>
      <EuiFlyout onClose={onCancel} aria-labelledby={titleId} size={flyoutSize} ownFocus>
        <Form
          onSubmit={formik.handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id={titleId}>{title}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiSkeletonText isLoading={isLoading}>
              {responseError && (
                <>
                  <EuiCallOut
                    announceOnMount
                    data-test-subj="apiKeyFlyoutResponseError"
                    color="danger"
                    title={
                      <FormattedMessage
                        id="xpack.security.accountManagement.apiKeyFlyout.responseErrorTitle"
                        defaultMessage="Error creating API key"
                      />
                    }
                  >
                    {responseError.message}
                  </EuiCallOut>
                  <EuiSpacer />
                </>
              )}
              {apiKey && !readOnly ? (
                !isOwner ? (
                  <>
                    <EuiCallOut
                      announceOnMount
                      iconType="lock"
                      title={
                        <FormattedMessage
                          id="xpack.security.accountManagement.apiKeyFlyout.readonlyOwnedByOtherUserWarning"
                          defaultMessage="You can’t update this API key. It belongs to another user."
                        />
                      }
                    />
                    <EuiSpacer />
                  </>
                ) : hasExpired ? (
                  <>
                    <EuiCallOut
                      announceOnMount
                      iconType="lock"
                      title={
                        <FormattedMessage
                          id="xpack.security.accountManagement.apiKeyFlyout.readonlyExpiredWarning"
                          defaultMessage="This API key has expired. You can no longer update it."
                        />
                      }
                    />
                    <EuiSpacer />
                  </>
                ) : null
              ) : null}
              <EuiPanel hasBorder>
                {apiKey ? (
                  <>
                    <EuiTitle size="xs">
                      <h4>
                        <FormattedMessage
                          id="xpack.security.accountManagement.apiKeyFlyout.overviewLabel"
                          defaultMessage="Overview"
                        />
                      </h4>
                    </EuiTitle>
                    <EuiSpacer />
                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>
                            <NameLabel />
                          </strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>{apiKey.name}</EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiHorizontalRule margin="s" />
                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.ownerLabel"
                              defaultMessage="Owner"
                            />
                          </strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="xs">
                          <EuiFlexItem grow={false}>
                            <EuiIcon type="user" aria-hidden={true} />
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>{apiKey.username}</EuiFlexItem>
                        </EuiFlexGroup>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiHorizontalRule margin="s" />

                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>
                            <TypeLabel />
                          </strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <ApiKeyBadge type={apiKey.type} />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiHorizontalRule margin="s" />

                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.createdLabel"
                              defaultMessage="Created"
                            />
                          </strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <TimeToolTip timestamp={apiKey.creation} />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiHorizontalRule margin="s" />

                    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.statusLabel"
                              defaultMessage="Status"
                            />
                          </strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <ApiKeyStatus expiration={apiKey.expiration} />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    {apiKey.type === 'cross_cluster' && apiKey.certificate_identity ? (
                      <>
                        <EuiHorizontalRule margin="s" />
                        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                          <EuiFlexItem grow={false}>
                            <EuiText size="xs">
                              <strong>
                                <FormattedMessage
                                  id="xpack.security.accountManagement.apiKeyFlyout.certificateIdentityOverviewLabel"
                                  defaultMessage="Identity verification"
                                />
                              </strong>
                            </EuiText>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <CertificateIdentityValue value={apiKey.certificate_identity} />
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <EuiFlexGroup justifyContent="flexStart" alignItems="center" gutterSize="s">
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="gear" aria-hidden={true} />
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiTitle size="xs">
                          <h4>
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.setup.title"
                              defaultMessage="Setup"
                            />
                          </h4>
                        </EuiTitle>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiSpacer size="xs" />
                    <EuiText color="subdued" size="xs">
                      <p>
                        <FormattedMessage
                          id="xpack.security.accountManagement.apiKeyFlyout.setup.description"
                          defaultMessage="Basic configuration details to create your API key."
                        />
                      </p>
                    </EuiText>
                    <EuiSpacer size="s" />
                    <FormRow label={<NameLabel />} fullWidth>
                      <FormField
                        name="name"
                        inputRef={inputRef}
                        data-test-subj="apiKeyNameInput"
                        disabled={readOnly || !!apiKey}
                        validate={{
                          required: i18n.translate(
                            'xpack.security.management.apiKeys.apiKeyFlyout.nameRequired',
                            {
                              defaultMessage: 'Enter a name.',
                            }
                          ),
                        }}
                        fullWidth
                      />
                    </FormRow>
                    {canManageCrossClusterApiKeys ? (
                      <FormRow name="type" label={<TypeLabel />} fullWidth>
                        <EuiFlexGroup gutterSize="m">
                          <EuiFlexItem>
                            <EuiCheckableCard
                              id="rest"
                              label={
                                <>
                                  <EuiTitle size="xxs">
                                    <h2>
                                      <FormattedMessage
                                        id="xpack.security.accountManagement.apiKeyFlyout.restTypeLabel"
                                        defaultMessage="User API key"
                                      />
                                    </h2>
                                  </EuiTitle>
                                  <EuiSpacer size="xs" />
                                  <EuiText size="s">
                                    <FormattedMessage
                                      id="xpack.security.accountManagement.apiKeyFlyout.restTypeDescription"
                                      defaultMessage="Allow external services to access the Elastic Stack on your behalf."
                                    />
                                  </EuiText>
                                </>
                              }
                              onChange={() => formik.setFieldValue('type', 'rest')}
                              checked={formik.values.type === 'rest'}
                            />
                          </EuiFlexItem>
                          <EuiFlexItem>
                            <EuiCheckableCard
                              id="cross_cluster"
                              label={
                                <>
                                  <EuiTitle size="xxs">
                                    <h2>
                                      <FormattedMessage
                                        id="xpack.security.accountManagement.apiKeyFlyout.crossClusterTypeLabel"
                                        defaultMessage="Cross-cluster API key"
                                      />
                                    </h2>
                                  </EuiTitle>
                                  <EuiSpacer size="xs" />
                                  <EuiText size="s">
                                    <FormattedMessage
                                      id="xpack.security.accountManagement.apiKeyFlyout.crossClusterTypeDescription"
                                      defaultMessage="Allow other clusters to connect to this cluster."
                                    />
                                  </EuiText>
                                </>
                              }
                              onChange={() => formik.setFieldValue('type', 'cross_cluster')}
                              checked={formik.values.type === 'cross_cluster'}
                            />
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </FormRow>
                    ) : (
                      <EuiFormRow label={<TypeLabel />}>
                        <ApiKeyBadge type="rest" />
                      </EuiFormRow>
                    )}
                  </>
                )}
              </EuiPanel>
              <EuiSpacer />
              {formik.values.type === 'cross_cluster' ? (
                <EuiPanel hasBorder>
                  <div style={{ paddingRight: euiTheme.size.s }}>
                    <EuiFlexGroup justifyContent="flexStart" alignItems="center" gutterSize="s">
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="lock" aria-hidden={true} />
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiTitle size="xs">
                          <h4>
                            {i18n.translate(
                              'xpack.security.accountManagement.apiKeyFlyout.accessPermissions.title',
                              {
                                defaultMessage: 'Access Permissions',
                              }
                            )}
                          </h4>
                        </EuiTitle>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </div>
                  <FormRow
                    data-test-subj="apiKeysAccessCodeEditor"
                    label={
                      <FormattedMessage
                        id="xpack.security.accountManagement.apiKeyFlyout.accessLabel"
                        defaultMessage="Access"
                      />
                    }
                    helpText={
                      <EuiLink
                        href={docLinks!.links.apis.createCrossClusterApiKey}
                        target="_blank"
                        external
                      >
                        <FormattedMessage
                          id="xpack.security.accountManagement.apiKeyFlyout.accessHelpText"
                          defaultMessage="Learn how to structure access permissions."
                        />
                      </EuiLink>
                    }
                    fullWidth
                  >
                    <FormField
                      as={CodeEditorField}
                      name="access"
                      aria-label={i18n.translate(
                        'xpack.security.management.apiKeys.apiKeyFlyout.accessCodeEditor',
                        {
                          defaultMessage: 'Code editor for access permissions',
                        }
                      )}
                      value={formik.values.access}
                      options={{ readOnly: readOnly || (apiKey && !canEdit) }}
                      onChange={(value: string) => formik.setFieldValue('access', value)}
                      validate={(value: string) => {
                        if (!value) {
                          return i18n.translate(
                            'xpack.security.management.apiKeys.apiKeyFlyout.accessRequired',
                            {
                              defaultMessage: 'Enter access permissions or disable this option.',
                            }
                          );
                        }
                        try {
                          JSON.parse(value);
                        } catch (e) {
                          return invalidJsonError;
                        }
                      }}
                      fullWidth
                      languageId="xjson"
                      height={200}
                    />
                  </FormRow>
                </EuiPanel>
              ) : (
                <EuiPanel hasBorder>
                  <div style={{ paddingRight: euiTheme.size.s }}>
                    <EuiSwitch
                      label={
                        <EuiTitle size="xs">
                          <h4>
                            {i18n.translate(
                              'xpack.security.accountManagement.apiKeyFlyout.privileges.title',
                              {
                                defaultMessage: 'Control security privileges',
                              }
                            )}
                          </h4>
                        </EuiTitle>
                      }
                      checked={formik.values.customPrivileges}
                      data-test-subj="apiKeysRoleDescriptorsSwitch"
                      onChange={(e) => formik.setFieldValue('customPrivileges', e.target.checked)}
                      disabled={readOnly || (apiKey && !canEdit)}
                    />
                    <EuiSpacer size="xs" />
                    <EuiText color="subdued" size="xs">
                      <p>
                        {i18n.translate(
                          'xpack.security.accountManagement.apiKeyFlyout.privileges.description',
                          {
                            defaultMessage:
                              'Control access to specific Elasticsearch APIs and resources using predefined roles or custom privileges per API key.',
                          }
                        )}
                      </p>
                    </EuiText>
                  </div>
                  {formik.values.customPrivileges && (
                    <>
                      <EuiSpacer />
                      <EuiPanel hasShadow={false} color="subdued">
                        <EuiFlexGroup
                          gutterSize="none"
                          justifyContent="flexEnd"
                          alignItems="baseline"
                        >
                          <EuiFlexItem grow={false}>
                            <EuiText size="xs">
                              <h4>
                                {i18n.translate(
                                  'xpack.security.apiKey.privileges.boilerplate.label',
                                  {
                                    defaultMessage: 'Replace with boilerplate:',
                                  }
                                )}
                              </h4>
                            </EuiText>
                          </EuiFlexItem>

                          <EuiFlexItem grow={false}>
                            <EuiButtonEmpty
                              data-test-subj="apiKeysReadOnlyDescriptors"
                              onClick={() =>
                                formik.setFieldValue('role_descriptors', READ_ONLY_BOILERPLATE)
                              }
                            >
                              {i18n.translate(
                                'xpack.security.apiKeys.apiKeyFlyout.roleDescriptors.readOnlyLabel',
                                {
                                  defaultMessage: 'Read-only',
                                }
                              )}
                            </EuiButtonEmpty>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiButtonEmpty
                              data-test-subj="apiKeysWriteOnlyDescriptors"
                              onClick={() =>
                                formik.setFieldValue('role_descriptors', WRITE_ONLY_BOILERPLATE)
                              }
                            >
                              {i18n.translate(
                                'xpack.security.management.apiKeys.apiKeyFlyout.roleDescriptors.writeOnlyLabel',
                                {
                                  defaultMessage: 'Write-only',
                                }
                              )}
                            </EuiButtonEmpty>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      </EuiPanel>
                      <FormRow
                        helpText={
                          <EuiLink
                            href={docLinks!.links.apis.createApiKeyRoleDescriptors}
                            target="_blank"
                            external
                          >
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.roleDescriptorsHelpText"
                              defaultMessage="Learn how to structure role descriptors."
                            />
                          </EuiLink>
                        }
                        fullWidth
                        data-test-subj="apiKeysRoleDescriptorsCodeEditor"
                      >
                        <FormField
                          as={CodeEditorField}
                          name="role_descriptors"
                          aria-label={i18n.translate(
                            'xpack.security.management.apiKeys.apiKeyFlyout.roleDescriptorsCodeEditor',
                            {
                              defaultMessage: 'Code editor for role descriptors of this API key',
                            }
                          )}
                          value={formik.values.role_descriptors}
                          options={{ readOnly: readOnly || (apiKey && !canEdit) }}
                          onChange={(value: string) =>
                            formik.setFieldValue('role_descriptors', value)
                          }
                          validate={(value: string) => {
                            if (!value) {
                              return i18n.translate(
                                'xpack.security.management.apiKeys.apiKeyFlyout.roleDescriptorsRequired',
                                {
                                  defaultMessage: 'Enter role descriptors or disable this option.',
                                }
                              );
                            }
                            try {
                              JSON.parse(value);
                            } catch (e) {
                              return invalidJsonError;
                            }
                          }}
                          fullWidth
                          languageId="xjson"
                          height={200}
                        />
                      </FormRow>
                    </>
                  )}
                </EuiPanel>
              )}
              <EuiSpacer size="l" />
              <EuiTitle size="xs">
                <h3>
                  <FormattedMessage
                    id="xpack.security.accountManagement.apiKeyFlyout.optionalSettings.title"
                    defaultMessage="Optional settings"
                  />
                </h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiPanel hasBorder>
                <div style={{ paddingRight: euiTheme.size.s }}>
                  <EuiSwitch
                    data-test-subj="apiKeyCustomExpirationSwitch"
                    label={
                      <EuiTitle size="xs">
                        <h4>
                          <FormattedMessage
                            id="xpack.security.accountManagement.apiKeyFlyout.applyExpirationDateLabel"
                            defaultMessage="Add expiration date"
                          />
                        </h4>
                      </EuiTitle>
                    }
                    checked={Boolean(formik.values.customExpiration)}
                    disabled={readOnly || (apiKey && !canEdit) || (!!apiKey && !!apiKey.expiration)}
                    onChange={(e) => formik.setFieldValue('customExpiration', e.target.checked)}
                  />
                  <EuiSpacer size="xs" />
                  <EuiText color="subdued" size="xs">
                    <p>
                      <FormattedMessage
                        id="xpack.security.accountManagement.apiKeyFlyout.expiresFieldHelpText"
                        defaultMessage="Setting an expiration date is a security best practice. Defaults to no expiration."
                      />
                    </p>
                  </EuiText>
                </div>
                {formik.values.customExpiration && (
                  <>
                    <EuiSpacer />
                    <EuiFormRow
                      fullWidth
                      helpText={
                        <FormattedMessage
                          id="xpack.security.accountManagement.apiKeyFlyout.expirationHelpText"
                          defaultMessage="This API Key will expire on {expirationDate}"
                          values={{
                            expirationDate: (
                              <strong>
                                <FormattedDate
                                  year="numeric"
                                  month="long"
                                  day="numeric"
                                  value={expirationDate!}
                                />
                              </strong>
                            ),
                          }}
                        />
                      }
                    >
                      <FormField
                        as={EuiFieldNumber}
                        name="expiration"
                        min={0}
                        append={i18n.translate(
                          'xpack.security.accountManagement.apiKeyFlyout.expirationUnit',
                          {
                            defaultMessage: 'days',
                          }
                        )}
                        validate={{
                          min: {
                            value: 1,
                            message: i18n.translate(
                              'xpack.security.management.apiKeys.apiKeyFlyout.expirationRequired',
                              {
                                defaultMessage: 'Enter a valid duration or disable this option.',
                              }
                            ),
                          },
                        }}
                        disabled={readOnly || (apiKey && !canEdit)}
                        data-test-subj="apiKeyCustomExpirationInput"
                      />
                    </EuiFormRow>
                  </>
                )}
              </EuiPanel>
              <EuiSpacer size="l" />
              <EuiPanel hasBorder>
                <div style={{ paddingRight: euiTheme.size.s }}>
                  <EuiSwitch
                    label={
                      <EuiTitle size="xs">
                        <h4>
                          <FormattedMessage
                            id="xpack.security.accountManagement.apiKeyFlyout.metadata.title"
                            defaultMessage="Add metadata"
                          />
                        </h4>
                      </EuiTitle>
                    }
                    data-test-subj="apiKeysMetadataSwitch"
                    checked={formik.values.includeMetadata}
                    disabled={readOnly || (apiKey && !canEdit)}
                    onChange={(e) => formik.setFieldValue('includeMetadata', e.target.checked)}
                  />
                  <EuiSpacer size="xs" />
                  <EuiText color="subdued" size="xs">
                    <p>
                      <FormattedMessage
                        id="xpack.security.accountManagement.apiKeyFlyout.metadata.description"
                        defaultMessage="Use configurable key-value pairs to add information about the API key or customize Elasticsearch resource access."
                      />
                    </p>
                  </EuiText>
                </div>
                {formik.values.includeMetadata && (
                  <>
                    <EuiSpacer />
                    <FormRow
                      data-test-subj="apiKeysMetadataCodeEditor"
                      helpText={
                        <EuiLink
                          href={docLinks!.links.apis.createApiKeyMetadata}
                          target="_blank"
                          external
                        >
                          <FormattedMessage
                            id="xpack.security.accountManagement.apiKeyFlyout.metadataHelpText"
                            defaultMessage="Learn how to structure metadata."
                          />
                        </EuiLink>
                      }
                      fullWidth
                    >
                      <FormField
                        as={CodeEditorField}
                        name="metadata"
                        aria-label={i18n.translate(
                          'xpack.security.management.apiKeys.apiKeyFlyout.metadataCodeEditor',
                          {
                            defaultMessage:
                              'Code editor for arbitrary metadata associated with the API key',
                          }
                        )}
                        options={{ readOnly: readOnly || (apiKey && !canEdit) }}
                        value={formik.values.metadata}
                        onChange={(value: string) => formik.setFieldValue('metadata', value)}
                        validate={(value: string) => {
                          if (!value) {
                            return i18n.translate(
                              'xpack.security.management.apiKeys.apiKeyFlyout.metadataRequired',
                              {
                                defaultMessage: 'Enter metadata or disable this option.',
                              }
                            );
                          }
                          try {
                            JSON.parse(value);
                          } catch (e) {
                            return invalidJsonError;
                          }
                        }}
                        fullWidth
                        languageId="xjson"
                        height={200}
                      />
                    </FormRow>
                  </>
                )}
              </EuiPanel>
              {formik.values.type === 'cross_cluster' && (
                <>
                  <EuiSpacer size="l" />
                  <EuiPanel hasBorder>
                    <div style={{ paddingRight: euiTheme.size.s }}>
                      <EuiSwitch
                        data-test-subj="apiKeyCertificateIdentitySwitch"
                        label={
                          <EuiTitle size="xs">
                            <h4>
                              <FormattedMessage
                                id="xpack.security.accountManagement.apiKeyFlyout.strongIdentityVerification.title"
                                defaultMessage="Add strong identity verification"
                              />
                            </h4>
                          </EuiTitle>
                        }
                        checked={formik.values.includeCertificateIdentity}
                        disabled={readOnly || (apiKey && !canEdit)}
                        onChange={(e) =>
                          formik.setFieldValue('includeCertificateIdentity', e.target.checked)
                        }
                      />
                      <EuiSpacer size="xs" />
                      <EuiText color="subdued" size="xs">
                        <p>
                          <FormattedMessage
                            id="xpack.security.accountManagement.apiKeyFlyout.strongIdentityVerification.description"
                            defaultMessage="This field is used to restrict API key to connections authenticated by a specific TLS certificate."
                          />
                        </p>
                      </EuiText>
                    </div>
                    {formik.values.includeCertificateIdentity && (
                      <>
                        <EuiSpacer />
                        <FormRow
                          label={
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.certificateIdentityLabel"
                              defaultMessage="Certificate identity string"
                            />
                          }
                          helpText={
                            <FormattedMessage
                              id="xpack.security.accountManagement.apiKeyFlyout.certificateIdentityHelpText"
                              defaultMessage="The value should match the certificate's distinguished name (DN) pattern. {learnMore}"
                              values={{
                                learnMore: (
                                  <EuiLink
                                    href={docLinks!.links.apis.createCrossClusterApiKey}
                                    target="_blank"
                                    external
                                  >
                                    <FormattedMessage
                                      id="xpack.security.accountManagement.apiKeyFlyout.certificateIdentityLearnMoreLink"
                                      defaultMessage="Learn more"
                                    />
                                  </EuiLink>
                                ),
                              }}
                            />
                          }
                          fullWidth
                        >
                          <FormField
                            name="certificateIdentity"
                            data-test-subj="apiKeyCertificateIdentityInput"
                            placeholder="CN=host,OU=engineering,DC=example,DC=com"
                            disabled={readOnly || (apiKey && !canEdit)}
                            validate={{
                              required: i18n.translate(
                                'xpack.security.management.apiKeys.apiKeyFlyout.certificateIdentityRequired',
                                {
                                  defaultMessage:
                                    'Enter a certificate identity or disable this option.',
                                }
                              ),
                            }}
                            fullWidth
                          />
                        </FormRow>
                      </>
                    )}
                  </EuiPanel>
                </>
              )}
            </EuiSkeletonText>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  data-test-subj="formFlyoutCancelButton"
                  flush="right"
                  isDisabled={isLoading}
                  onClick={onCancel}
                >
                  <FormattedMessage
                    id="xpack.security.formFlyout.cancelButton"
                    defaultMessage="Cancel"
                  />
                </EuiButtonEmpty>
              </EuiFlexItem>
              {!isSubmitButtonHidden && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    data-test-subj="formFlyoutSubmitButton"
                    isLoading={formik.isSubmitting}
                    isDisabled={isSubmitDisabled}
                    fill
                    type="submit"
                  >
                    {submitButtonText}
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </Form>
      </EuiFlyout>
    </FormikProvider>
  );
};

export function mapCreateApiKeyValues(values: ApiKeyFormValues): CreateAPIKeyParams {
  const { type, name } = values;
  const expiration = values.customExpiration ? `${values.expiration}d` : undefined;
  const metadata = values.includeMetadata ? JSON.parse(values.metadata) : '{}';

  if (type === 'cross_cluster') {
    return {
      type,
      name,
      expiration,
      metadata,
      access: JSON.parse(values.access),
      certificate_identity: values.includeCertificateIdentity
        ? values.certificateIdentity
        : undefined,
    };
  }

  return {
    name,
    expiration,
    metadata,
    role_descriptors: values.customPrivileges ? JSON.parse(values.role_descriptors) : '{}',
  };
}

export function mapUpdateApiKeyValues(
  type: CategorizedApiKey['type'],
  id: string,
  values: ApiKeyFormValues,
  initialValues: ApiKeyFormValues
): UpdateAPIKeyParams {
  const expiration = getUpdatedExpiration(values, initialValues);
  const metadata = values.includeMetadata ? JSON.parse(values.metadata) : '{}';

  if (type === 'cross_cluster') {
    return {
      type,
      id,
      expiration,
      metadata,
      access: JSON.parse(values.access),
      certificate_identity: getUpdatedCertificateIdentity(values, initialValues),
    };
  }

  return {
    id,
    expiration,
    metadata,
    role_descriptors: values.customPrivileges ? JSON.parse(values.role_descriptors) : '{}',
  };
}

/**
 * Determines the `expiration` value to send when updating an API key. Elasticsearch only accepts a
 * relative duration (e.g. `30d`) and interprets an omitted value as "leave unchanged"; it has no way
 * to clear an existing expiration on update. To avoid silently pushing the deadline forward (or
 * reactivating an already-expired key) every time the form is saved, we only send a value when the
 * user actually changed the expiration settings.
 */
function getUpdatedExpiration(
  values: ApiKeyFormValues,
  initialValues: ApiKeyFormValues
): string | undefined {
  const hasChanged =
    values.customExpiration !== initialValues.customExpiration ||
    values.expiration !== initialValues.expiration;

  return hasChanged && values.customExpiration ? `${values.expiration}d` : undefined;
}

/**
 * Determines the `certificate_identity` value to send when updating a cross-cluster API key.
 * Elasticsearch clears an existing value when `null` is sent explicitly and leaves it unchanged when
 * the field is omitted. We only send `null` when the key previously had a certificate identity that
 * the user has now disabled, so updates to keys that never had one don't carry a redundant `null`.
 */
function getUpdatedCertificateIdentity(
  values: ApiKeyFormValues,
  initialValues: ApiKeyFormValues
): string | null | undefined {
  if (values.includeCertificateIdentity) {
    return values.certificateIdentity;
  }

  return initialValues.includeCertificateIdentity ? null : undefined;
}

/**
 * Maps data from the selected API key to pre-populate the form
 */
function mapApiKeyFormValues(apiKey: CategorizedApiKey): ApiKeyFormValues {
  const includeMetadata = Object.keys(apiKey.metadata).length > 0;
  const customPrivileges =
    apiKey.type !== 'cross_cluster' ? Object.keys(apiKey.role_descriptors).length > 0 : false;
  const certificateIdentity =
    apiKey.type === 'cross_cluster' ? apiKey.certificate_identity ?? '' : '';

  return {
    name: apiKey.name,
    type: apiKey.type,
    customExpiration: !!apiKey.expiration,
    expiration: getRemainingExpirationDays(apiKey.expiration),
    includeMetadata,
    metadata: includeMetadata ? JSON.stringify(apiKey.metadata, null, 2) : '{}',
    customPrivileges,
    role_descriptors: customPrivileges
      ? JSON.stringify(apiKey.type !== 'cross_cluster' && apiKey.role_descriptors, null, 2)
      : '{}',
    access: apiKey.type === 'cross_cluster' ? JSON.stringify(apiKey.access, null, 2) : '{}',
    includeCertificateIdentity: !!certificateIdentity,
    certificateIdentity,
  };
}

/**
 * Converts an absolute API key expiration timestamp (epoch ms) into the number of remaining whole
 * days from now, so it can be edited in the expiration field (which is expressed in days). Returns an
 * empty string when the key has no expiration.
 */
function getRemainingExpirationDays(expiration?: number): string {
  if (!expiration) {
    return '';
  }
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const remainingDays = Math.ceil((Number(expiration) - Date.now()) / millisecondsPerDay);
  return String(Math.max(1, remainingDays));
}
