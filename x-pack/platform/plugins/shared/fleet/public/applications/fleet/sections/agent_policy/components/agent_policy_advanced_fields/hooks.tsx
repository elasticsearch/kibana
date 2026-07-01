/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiText, EuiSpacer } from '@elastic/eui';

import {
  useGetOutputs,
  useLicense,
  useGetDownloadSources,
  useGetFleetServerHosts,
  useStartServices,
} from '../../../../hooks';
import {
  LICENCE_FOR_PER_POLICY_OUTPUT,
  SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
  SERVERLESS_PRIVATE_OUTPUT_ID,
} from '../../../../../../../common/constants';
import {
  getAllowedOutputTypesForAgentPolicy,
  policyHasFleetServer,
  policyHasSyntheticsIntegration,
} from '../../../../../../../common/services';
import type { NewAgentPolicy, AgentPolicy } from '../../../../types';
import { useAgentless } from '../../create_package_policy_page/single_page_layout/hooks/setup_technology';

// The super select component do not support null or '' as a value
export const DEFAULT_SELECT_VALUE = '@@##DEFAULT_SELECT##@@';

function getOutputLabel(name: string, disabledMessage?: React.ReactNode) {
  if (!disabledMessage) {
    return name;
  }

  return (
    <>
      <EuiText size="s">{name}</EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="s">{disabledMessage}</EuiText>
    </>
  );
}

function getDefaultOutput(
  defaultOutputName?: string,
  defaultOutputDisabled?: boolean,
  defaultOutputDisabledMessage?: React.ReactNode
) {
  return {
    inputDisplay: getOutputLabel(
      i18n.translate('xpack.fleet.agentPolicy.outputOptions.defaultOutputText', {
        defaultMessage: 'Default (currently {defaultOutputName})',
        values: { defaultOutputName },
      }),
      defaultOutputDisabledMessage
    ),
    value: DEFAULT_SELECT_VALUE,
    disabled: defaultOutputDisabled,
  };
}

export function useOutputOptions(agentPolicy: Partial<NewAgentPolicy | AgentPolicy>) {
  const outputsRequest = useGetOutputs();
  const licenseService = useLicense();
  const { isAgentlessAgentPolicy } = useAgentless();
  const { cloud } = useStartServices();
  const isServerless = cloud?.isServerlessEnabled ?? false;

  // Allow changing output when agent policy has fleet server or synthetics integrations
  // regardless of license level
  const isPolicyPerOutputAllowed =
    licenseService.hasAtLeast(LICENCE_FOR_PER_POLICY_OUTPUT) ||
    policyHasFleetServer(agentPolicy as AgentPolicy) ||
    policyHasSyntheticsIntegration(agentPolicy as AgentPolicy);

  const isAgentless = isAgentlessAgentPolicy(agentPolicy as AgentPolicy);

  const allowedOutputTypes = useMemo(
    () => getAllowedOutputTypesForAgentPolicy(agentPolicy as AgentPolicy),
    [agentPolicy]
  );

  const dataOutputOptions = useMemo(() => {
    if (outputsRequest.isLoading || !outputsRequest.data) {
      return [];
    }

    if (outputsRequest.isLoading || !outputsRequest.data) {
      return [];
    }

    const defaultOutput = outputsRequest.data.items.find((item) => item.is_default);
    const defaultOutputName = defaultOutput?.name;
    const defaultOutputDisabled =
      defaultOutput?.type && !allowedOutputTypes.includes(defaultOutput.type);

    const defaultOutputDisabledMessage = defaultOutputDisabled ? (
      <FormattedMessage
        id="xpack.fleet.agentPolicyForm.outputOptionDisableOutputTypeText"
        defaultMessage="{outputType} output for agent integration is not supported for this policy."
        values={{
          outputType: defaultOutput.type,
        }}
      />
    ) : undefined;

    return [
      getDefaultOutput(defaultOutputName, defaultOutputDisabled, defaultOutputDisabledMessage),
      ...outputsRequest.data.items
        .filter(
          (item) =>
            !(isAgentless && item.id === SERVERLESS_PRIVATE_OUTPUT_ID) &&
            (!item.is_internal ||
              isAgentless ||
              (isServerless && item.id === SERVERLESS_PRIVATE_OUTPUT_ID))
        )
        .map((item) => {
          const isOutputTypeUnsupported = !allowedOutputTypes.includes(item.type);

          return {
            value: item.id,
            inputDisplay: getOutputLabel(
              item.name,
              isOutputTypeUnsupported ? (
                <FormattedMessage
                  id="xpack.fleet.agentPolicyForm.outputOptionDisabledTypeNotSupportedText"
                  defaultMessage="{outputType} output for agent integration is not supported for this policy."
                  values={{
                    outputType: item.type,
                  }}
                />
              ) : undefined
            ),
            disabled: !isPolicyPerOutputAllowed || isOutputTypeUnsupported,
          };
        }),
    ];
  }, [outputsRequest, isPolicyPerOutputAllowed, allowedOutputTypes, isAgentless, isServerless]);

  const monitoringOutputOptions = useMemo(() => {
    if (outputsRequest.isLoading || !outputsRequest.data) {
      return [];
    }

    const defaultOutputName = outputsRequest.data.items.find(
      (item) => item.is_default_monitoring
    )?.name;
    return [
      getDefaultOutput(defaultOutputName),
      ...outputsRequest.data.items
        .filter(
          (item) =>
            !(isAgentless && item.id === SERVERLESS_PRIVATE_OUTPUT_ID) &&
            (!item.is_internal ||
              isAgentless ||
              (isServerless && item.id === SERVERLESS_PRIVATE_OUTPUT_ID))
        )
        .map((item) => {
          return {
            value: item.id,
            inputDisplay: item.name,
            disabled: !isPolicyPerOutputAllowed,
          };
        }),
    ];
  }, [outputsRequest, isPolicyPerOutputAllowed, isAgentless, isServerless]);

  const dataOutputValueOfSelected = agentPolicy.data_output_id || DEFAULT_SELECT_VALUE;

  return useMemo(
    () => ({
      dataOutputOptions,
      monitoringOutputOptions,
      dataOutputValueOfSelected,
      isLoading: outputsRequest.isLoading,
    }),
    [
      dataOutputOptions,
      dataOutputValueOfSelected,
      monitoringOutputOptions,
      outputsRequest.isLoading,
    ]
  );
}

export function useDownloadSourcesOptions() {
  const downloadSourcesRequest = useGetDownloadSources();

  const dataDownloadSourceOptions = useMemo(() => {
    if (downloadSourcesRequest.isLoading || !downloadSourcesRequest.data) {
      return [];
    }

    const defaultDownloadSource = downloadSourcesRequest.data.items.find((item) => item.is_default);
    const defaultDownloadSourceName = defaultDownloadSource?.name;

    return [
      getDefaultDownloadSource(defaultDownloadSourceName),
      ...downloadSourcesRequest.data.items.map((item) => {
        return {
          value: item.id,
          inputDisplay: item.name,
        };
      }),
    ];
  }, [downloadSourcesRequest]);

  return useMemo(
    () => ({
      dataDownloadSourceOptions,
      isLoading: downloadSourcesRequest.isLoading,
    }),
    [dataDownloadSourceOptions, downloadSourcesRequest.isLoading]
  );
}

function getDefaultDownloadSource(
  defaultDownloadSourceName?: string,
  defaultDownloadSourceDisabled?: boolean,
  defaultDownloadSourceDisabledMessage?: React.ReactNode
) {
  return {
    inputDisplay: getOutputLabel(
      i18n.translate('xpack.fleet.agentPolicy.downloadSourcesOptions.defaultOutputText', {
        defaultMessage: 'Default (currently {defaultDownloadSourceName})',
        values: { defaultDownloadSourceName },
      }),
      defaultDownloadSourceDisabledMessage
    ),
    value: DEFAULT_SELECT_VALUE,
    disabled: defaultDownloadSourceDisabled,
  };
}

export function useFleetServerHostsOptions(agentPolicy: Partial<NewAgentPolicy | AgentPolicy>) {
  const fleetServerHostsRequest = useGetFleetServerHosts();
  const { isAgentlessAgentPolicy } = useAgentless();
  const isAgentless = isAgentlessAgentPolicy(agentPolicy as AgentPolicy);
  const { cloud } = useStartServices();
  const isServerless = cloud?.isServerlessEnabled ?? false;

  const fleetServerHostsOptions = useMemo(() => {
    if (fleetServerHostsRequest.isLoading || !fleetServerHostsRequest.data) {
      return [];
    }

    const defaultFleetServerHosts = fleetServerHostsRequest.data.items.find(
      (item) => item.is_default
    );
    const defaultFleetServerHostsName = defaultFleetServerHosts?.name;

    return [
      getDefaultFleetServerHosts(defaultFleetServerHostsName),
      ...fleetServerHostsRequest.data.items
        .filter(
          (item) =>
            !(isAgentless && item.id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID) &&
            (!item.is_internal ||
              isAgentless ||
              (isServerless && item.id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID))
        )
        .map((item) => {
          return {
            value: item.id,
            inputDisplay: item.name,
          };
        }),
    ];
  }, [fleetServerHostsRequest, isAgentless, isServerless]);

  return useMemo(
    () => ({
      fleetServerHostsOptions,
      isLoading: fleetServerHostsRequest.isLoading,
    }),
    [fleetServerHostsOptions, fleetServerHostsRequest.isLoading]
  );
}

function getDefaultFleetServerHosts(
  defaultFleetServerHostsName?: string,
  defaultFleetServerHostsDisabled?: boolean,
  defaultFleetServerHostsDisabledMessage?: React.ReactNode
) {
  return {
    inputDisplay: getOutputLabel(
      i18n.translate('xpack.fleet.agentPolicy.fleetServerHostsOptions.defaultOutputText', {
        defaultMessage: 'Default (currently {defaultFleetServerHostsName})',
        values: { defaultFleetServerHostsName },
      }),
      defaultFleetServerHostsDisabledMessage
    ),
    value: DEFAULT_SELECT_VALUE,
    disabled: defaultFleetServerHostsDisabled,
  };
}
