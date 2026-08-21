/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import { i18n } from '@kbn/i18n';
import type { PolicyFormComponentCommonProps } from '../../types';
import type { UIPolicyConfig } from '../../../../../../../../common/endpoint/types';
import { constrainLinuxTtyIo } from '../../../../../../../../common/endpoint/models/policy_config_helpers';
import type { EventFormOption, SupplementalEventFormOption } from '../event_collection_card';
import { EventCollectionCard } from '../event_collection_card';
import { useIsExperimentalFeatureEnabled } from '../../../../../../../common/hooks/use_experimental_features';

const DNS_OPTION: EventFormOption<OperatingSystem.LINUX> = {
  name: i18n.translate('xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.dns', {
    defaultMessage: 'DNS',
  }),
  protectionField: 'dns',
};

const BASE_OPTIONS: ReadonlyArray<EventFormOption<OperatingSystem.LINUX>> = [
  {
    name: i18n.translate('xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.file', {
      defaultMessage: 'File',
    }),
    protectionField: 'file',
  },
  {
    name: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.process',
      {
        defaultMessage: 'Process',
      }
    ),
    protectionField: 'process',
  },
  {
    name: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.network',
      {
        defaultMessage: 'Network',
      }
    ),
    protectionField: 'network',
  },
];

const SUPPLEMENTAL_OPTIONS: ReadonlyArray<SupplementalEventFormOption<OperatingSystem.LINUX>> = [
  {
    id: 'sessionDataSection',
    title: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.session_data.title',
      {
        defaultMessage: 'Session data',
      }
    ),
    description: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.session_data.description',
      {
        defaultMessage:
          'Turn this on to capture the extended process data required for Session View. Session View provides you a visual representation of session and process execution data. Session View data is organized according to the Linux process model to help you investigate process, user, and service activity on your Linux infrastructure.',
      }
    ),
    name: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.session_data.label',
      {
        defaultMessage: 'Collect session data',
      }
    ),
    protectionField: 'session_data',
    isDisabled: (config: UIPolicyConfig) => {
      return !config.linux.events.process;
    },
  },
  {
    name: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.tty_io.label',
      {
        defaultMessage: 'Capture terminal output',
      }
    ),
    protectionField: 'tty_io',
    tooltipText: i18n.translate(
      'xpack.securitySolution.endpoint.policyDetailsConfig.linux.events.tty_io.tooltip',
      {
        defaultMessage:
          'Turn this on to collect terminal (tty) output. Terminal output appears in Session View, and you can view it separately to see what commands were executed and how they were typed, provided the terminal is in echo mode. Only works on hosts that support ebpf.',
      }
    ),
    indented: true,
    isDisabled: (config: UIPolicyConfig) => {
      return !config.linux.events.session_data;
    },
  },
];

export type LinuxEventCollectionCardProps = PolicyFormComponentCommonProps;

export const LinuxEventCollectionCard = memo<LinuxEventCollectionCardProps>(
  ({ onChange, mode, ...restProps }) => {
    const isLinuxDnsEnabled = useIsExperimentalFeatureEnabled('linuxDnsEvents');

    const options = useMemo(() => {
      if (isLinuxDnsEnabled) {
        return [DNS_OPTION, ...BASE_OPTIONS];
      }
      return BASE_OPTIONS;
    }, [isLinuxDnsEnabled]);

    const supplementalOptions = useMemo(() => {
      if (mode === 'edit') {
        return SUPPLEMENTAL_OPTIONS;
      }

      // View only mode: remove instructions for session data
      return SUPPLEMENTAL_OPTIONS.map((option) => {
        if (option.id === 'sessionDataSection') {
          return {
            ...option,
            description: undefined,
          };
        }

        return option;
      });
    }, [mode]);

    const changeHandler: PolicyFormComponentCommonProps['onChange'] = useCallback(
      ({ isValid, updatedPolicy }) => {
        if (isValid) {
          constrainLinuxTtyIo(updatedPolicy);
        }

        onChange({ isValid, updatedPolicy });
      },
      [onChange]
    );

    return (
      <EventCollectionCard<OperatingSystem.LINUX>
        {...restProps}
        mode={mode}
        onChange={changeHandler}
        os={OperatingSystem.LINUX}
        selection={restProps.policy.linux.events}
        supplementalOptions={supplementalOptions}
        options={options}
      />
    );
  }
);
LinuxEventCollectionCard.displayName = 'LinuxEventCollectionCard';
