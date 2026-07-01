/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useMemo, useState } from 'react';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { useRadioInput } from '../../../../hooks';
import {
  sendPostFleetServerHost,
  sendPutFleetServerHost,
  useAuthz,
  useComboInput,
  useInput,
  useStartServices,
  useSwitchInput,
  validateInputs,
  useSecretInput,
} from '../../../../hooks';
import { isDiffPathProtocol } from '../../../../../../../common/services';
import { validateSslPathInput, validateSslPathsCombo } from '../ssl_form_validators';
import { useConfirmModal } from '../../hooks/use_confirm_modal';
import type { FleetServerHost } from '../../../../types';
import type { ClientAuth, NewFleetServerHost, ValueOf } from '../../../../../../../common/types';
import { clientAuth } from '../../../../../../../common/types';

const URL_REGEX = /^(https):\/\/[^\s$.?#].[^\s]*$/gm;

export interface FleetServerHostSSLInputsType {
  nameInput: ReturnType<typeof useInput>;
  hostUrlsInput: ReturnType<typeof useComboInput>;
  isDefaultInput: ReturnType<typeof useSwitchInput>;
  proxyIdInput?: ReturnType<typeof useInput>;
  sslCertificateInput: ReturnType<typeof useInput>;
  sslKeyInput: ReturnType<typeof useInput>;
  sslKeySecretInput: ReturnType<typeof useSecretInput>;
  sslCertificateAuthoritiesInput: ReturnType<typeof useComboInput>;
  sslEsCertificateInput: ReturnType<typeof useInput>;
  sslESKeyInput: ReturnType<typeof useInput>;
  sslESKeySecretInput: ReturnType<typeof useSecretInput>;
  sslEsCertificateAuthoritiesInput: ReturnType<typeof useComboInput>;
  sslClientAuthInput: ReturnType<typeof useRadioInput>;
  sslAgentCertificateInput: ReturnType<typeof useInput>;
  sslAgentKeyInput: ReturnType<typeof useInput>;
  sslAgentKeySecretInput: ReturnType<typeof useSecretInput>;
  sslAgentCertificateAuthoritiesInput: ReturnType<typeof useComboInput>;
}

const ConfirmTitle = () => (
  <FormattedMessage
    id="xpack.fleet.settings.fleetServerHostsFlyout.confirmModalTitle"
    defaultMessage="Save and deploy changes?"
  />
);

const ConfirmDescription: React.FunctionComponent = ({}) => (
  <FormattedMessage
    id="xpack.fleet.settings.fleetServerHostsFlyout.confirmModalText"
    defaultMessage="This action will update agent policies enrolled in this Fleet Server. This action can not be undone. Are you sure you wish to continue?"
  />
);

export function validateFleetServerHosts(value: string[]) {
  if (value.length === 0) {
    return [
      {
        message: i18n.translate('xpack.fleet.settings.fleetServerHostsEmptyError', {
          defaultMessage: 'At least one URL is required',
        }),
      },
    ];
  }

  const res: Array<{ message: string; index: number }> = [];
  const hostIndexes: { [key: string]: number[] } = {};
  value.forEach((val, idx) => {
    if (!val) {
      res.push({
        message: i18n.translate('xpack.fleet.settings.fleetServerHostsRequiredError', {
          defaultMessage: 'Host URL is required',
        }),
        index: idx,
      });
    } else if (!val.match(URL_REGEX)) {
      res.push({
        message: i18n.translate('xpack.fleet.settings.fleetServerHostsError', {
          defaultMessage: 'Invalid URL (must be an https URL)',
        }),
        index: idx,
      });
    }
    const curIndexes = hostIndexes[val] || [];
    hostIndexes[val] = [...curIndexes, idx];
  });

  Object.values(hostIndexes)
    .filter(({ length }) => length > 1)
    .forEach((indexes) => {
      indexes.forEach((index) =>
        res.push({
          message: i18n.translate('xpack.fleet.settings.fleetServerHostsDuplicateError', {
            defaultMessage: 'Duplicate URL',
          }),
          index,
        })
      );
    });

  if (res.length) {
    return res;
  }

  if (value.length && isDiffPathProtocol(value)) {
    return [
      {
        message: i18n.translate(
          'xpack.fleet.settings.fleetServerHostsDifferentPathOrProtocolError',
          {
            defaultMessage: 'Protocol and path must be the same for each URL',
          }
        ),
      },
    ];
  }
}

export function validateName(value: string) {
  if (!value || value === '') {
    return [
      i18n.translate('xpack.fleet.settings.fleetServerHost.nameIsRequiredErrorMessage', {
        defaultMessage: 'Name is required',
      }),
    ];
  }
}

export function useFleetServerHostsForm(
  fleetServerHost: FleetServerHost | undefined,
  onSuccess: () => void,
  defaultFleetServerHost?: FleetServerHost
) {
  const [isLoading, setIsLoading] = useState(false);
  const { notifications, cloud } = useStartServices();
  const authz = useAuthz();
  const { confirm } = useConfirmModal();
  const isEditDisabled = (fleetServerHost?.is_preconfigured || !authz.fleet.allSettings) ?? false;
  // Fields listed in allow_edit on a preconfigured host can be changed at runtime.
  const allowEdit = fleetServerHost?.allow_edit ?? [];

  const nameInput = useInput(fleetServerHost?.name ?? '', validateName, isEditDisabled);
  const isDefaultInput = useSwitchInput(
    fleetServerHost?.is_default ?? false,
    (isEditDisabled && !allowEdit.includes('is_default')) || !!fleetServerHost?.is_default
  );

  const isServerless = cloud?.isServerlessEnabled;

  // For an existing row always show that row's own URLs; only fall back to the default
  // host URLs when creating a new Fleet Server host in serverless (no fleetServerHost yet).
  const hostUrlsDefaultValue =
    fleetServerHost?.host_urls?.length
      ? fleetServerHost.host_urls
      : isServerless
      ? defaultFleetServerHost?.host_urls || []
      : [];

  const hostUrlsDisabled = isEditDisabled || isServerless;
  const hostUrlsInput = useComboInput(
    'hostUrls',
    hostUrlsDefaultValue,
    validateFleetServerHosts,
    hostUrlsDisabled
  );

  const proxyIdInput = useInput(fleetServerHost?.proxy_id ?? '', () => undefined, isEditDisabled);

  const sslCertificateAuthoritiesInput = useComboInput(
    'sslCertificateAuthoritiesComboxBox',
    fleetServerHost?.ssl?.certificate_authorities ?? [],
    validateSslPathsCombo,
    isEditDisabled
  );
  const sslCertificateInput = useInput(
    fleetServerHost?.ssl?.certificate ?? '',
    validateSslPathInput,
    isEditDisabled
  );

  const sslEsCertificateAuthoritiesInput = useComboInput(
    'sslEsCertificateAuthoritiesComboxBox',
    fleetServerHost?.ssl?.es_certificate_authorities ?? [],
    validateSslPathsCombo,
    isEditDisabled
  );
  const sslEsCertificateInput = useInput(
    fleetServerHost?.ssl?.es_certificate ?? '',
    validateSslPathInput,
    isEditDisabled
  );
  const sslKeyInput = useInput(
    fleetServerHost?.ssl?.key ?? '',
    validateSslPathInput,
    isEditDisabled
  );
  const sslESKeyInput = useInput(
    fleetServerHost?.ssl?.es_key ?? '',
    validateSslPathInput,
    isEditDisabled
  );

  const sslKeySecretInput = useSecretInput(
    (fleetServerHost as FleetServerHost)?.secrets?.ssl?.key,
    undefined,
    isEditDisabled
  );

  const sslESKeySecretInput = useSecretInput(
    (fleetServerHost as FleetServerHost)?.secrets?.ssl?.es_key,
    undefined,
    isEditDisabled
  );

  const sslClientAuthInput = useRadioInput(
    fleetServerHost?.ssl?.client_auth ?? clientAuth.None,
    isEditDisabled
  );

  const sslAgentCertificateAuthoritiesInput = useComboInput(
    'sslAgentCertificateAuthoritiesComboxBox',
    fleetServerHost?.ssl?.agent_certificate_authorities ?? [],
    validateSslPathsCombo,
    isEditDisabled
  );
  const sslAgentCertificateInput = useInput(
    fleetServerHost?.ssl?.agent_certificate ?? '',
    validateSslPathInput,
    isEditDisabled
  );
  const sslAgentKeySecretInput = useSecretInput(
    (fleetServerHost as FleetServerHost)?.secrets?.ssl?.agent_key,
    undefined,
    isEditDisabled
  );
  const sslAgentKeyInput = useInput(
    fleetServerHost?.ssl?.agent_key ?? '',
    validateSslPathInput,
    isEditDisabled
  );

  const inputs: FleetServerHostSSLInputsType = useMemo(
    () => ({
      nameInput,
      isDefaultInput,
      hostUrlsInput,
      proxyIdInput,
      sslCertificateAuthoritiesInput,
      sslCertificateInput,
      sslEsCertificateAuthoritiesInput,
      sslEsCertificateInput,
      sslKeyInput,
      sslESKeyInput,
      sslKeySecretInput,
      sslESKeySecretInput,
      sslClientAuthInput,
      sslAgentCertificateAuthoritiesInput,
      sslAgentCertificateInput,
      sslAgentKeyInput,
      sslAgentKeySecretInput,
    }),
    [
      nameInput,
      isDefaultInput,
      hostUrlsInput,
      proxyIdInput,
      sslCertificateAuthoritiesInput,
      sslCertificateInput,
      sslEsCertificateAuthoritiesInput,
      sslEsCertificateInput,
      sslKeyInput,
      sslESKeyInput,
      sslKeySecretInput,
      sslESKeySecretInput,
      sslClientAuthInput,
      sslAgentCertificateAuthoritiesInput,
      sslAgentCertificateInput,
      sslAgentKeyInput,
      sslAgentKeySecretInput,
    ]
  );
  const validate = useCallback(() => validateInputs({ ...inputs }), [inputs]);

  const submit = useCallback(async () => {
    try {
      if (!validate()) {
        return;
      }
      if (!(await confirm(<ConfirmTitle />, <ConfirmDescription />))) {
        return;
      }
      setIsLoading(true);
      // For preconfigured hosts only the fields listed in allow_edit may be sent —
      // the serverless URL guard blocks any PUT that includes host_urls.
      const data: Partial<NewFleetServerHost> = fleetServerHost?.is_preconfigured
        ? { is_default: isDefaultInput.value }
        : {
            name: nameInput.value,
            host_urls: hostUrlsInput.value,
            is_default: isDefaultInput.value,
            proxy_id: proxyIdInput.value !== '' ? proxyIdInput.value : null,
            ssl: {
              certificate: sslCertificateInput.value,
              key: sslKeyInput.value || undefined,
              certificate_authorities: sslCertificateAuthoritiesInput.value.filter(
                (val) => val !== ''
              ),
              es_certificate: sslEsCertificateInput.value,
              es_key: sslESKeyInput.value || undefined,
              es_certificate_authorities: sslEsCertificateAuthoritiesInput.value.filter(
                (val) => val !== ''
              ),
              agent_certificate: sslAgentCertificateInput.value,
              agent_key: sslAgentKeyInput.value || undefined,
              agent_certificate_authorities: sslAgentCertificateAuthoritiesInput.value.filter(
                (val) => val !== ''
              ),
              ...(sslClientAuthInput.value !== clientAuth.None && {
                client_auth: sslClientAuthInput.value as ValueOf<ClientAuth>,
              }),
            },
            ...(((!sslKeyInput.value && sslKeySecretInput.value) ||
              (!sslESKeyInput.value && sslESKeySecretInput.value) ||
              (!sslAgentKeyInput.value && sslAgentKeySecretInput.value)) && {
              secrets: {
                ssl: {
                  key: sslKeySecretInput.value || undefined,
                  es_key: sslESKeySecretInput.value || undefined,
                  agent_key: sslAgentKeySecretInput.value || undefined,
                },
              },
            }),
          };

      if (fleetServerHost) {
        const res = await sendPutFleetServerHost(fleetServerHost.id, data);
        if (res.error) {
          throw res.error;
        }
      } else {
        const res = await sendPostFleetServerHost(data);
        if (res.error) {
          throw res.error;
        }
      }
      notifications.toasts.addSuccess(
        i18n.translate('xpack.fleet.settings.fleetServerHostsFlyout.successToastTitle', {
          defaultMessage: 'Fleet Server host saved',
        })
      );
      setIsLoading(false);
      await onSuccess();
    } catch (error) {
      setIsLoading(false);
      notifications.toasts.addError(error, {
        title: i18n.translate('xpack.fleet.settings.fleetServerHostsFlyout.errorToastTitle', {
          defaultMessage: 'An error happened while saving Fleet Server host',
        }),
      });
    }
  }, [
    validate,
    confirm,
    nameInput.value,
    hostUrlsInput.value,
    isDefaultInput.value,
    proxyIdInput.value,
    sslCertificateInput.value,
    sslKeyInput.value,
    sslCertificateAuthoritiesInput.value,
    sslEsCertificateInput.value,
    sslESKeyInput.value,
    sslEsCertificateAuthoritiesInput.value,
    sslClientAuthInput.value,
    sslKeySecretInput.value,
    sslESKeySecretInput.value,
    fleetServerHost,
    notifications.toasts,
    sslAgentKeyInput.value,
    sslAgentKeySecretInput.value,
    sslAgentCertificateInput.value,
    sslAgentCertificateAuthoritiesInput.value,
    onSuccess,
  ]);

  const hasChanged = Object.values(inputs).some((input) => input.hasChanged);

  // For preconfigured hosts, only the allow_edit fields can change — skip URL/name/SSL checks.
  const isDisabled = fleetServerHost?.is_preconfigured
    ? isLoading || !isDefaultInput.hasChanged
    : isEditDisabled ||
      isLoading ||
      !hasChanged ||
      !nameInput.value ||
      !hostUrlsInput.value.some((v) => v.trim()) ||
      hostUrlsInput.props.isInvalid ||
      nameInput.props.isInvalid ||
      sslCertificateAuthoritiesInput.props.isInvalid ||
      sslCertificateInput.props.isInvalid ||
      sslKeyInput.props.isInvalid ||
      sslEsCertificateAuthoritiesInput.props.isInvalid ||
      sslEsCertificateInput.props.isInvalid ||
      sslESKeyInput.props.isInvalid ||
      sslAgentCertificateAuthoritiesInput.props.isInvalid ||
      sslAgentCertificateInput.props.isInvalid ||
      sslAgentKeyInput.props.isInvalid;

  return {
    isLoading,
    isDisabled,
    submit,
    inputs,
  };
}
