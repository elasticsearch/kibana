/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import type { EuiCheckboxProps } from '@elastic/eui';
import { EuiCheckbox, EuiFlexGroup, EuiFlexItem, EuiIconTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useKibana } from '../../../../../../common/lib/kibana';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type { BehaviorProtectionOSes } from '../../../types';
import type { PerOsPolicyAccessor } from './policy_accessor';

export interface PerOsReputationServiceProps<OS extends BehaviorProtectionOSes> {
  accessor: PerOsPolicyAccessor<OS>;
  onChange: (options: { isValid: boolean; updatedPolicy: PolicyConfig }) => void;
  mode?: 'edit' | 'view';
  'data-test-subj'?: string;
}

export const PerOsReputationService = <OS extends BehaviorProtectionOSes>({
  accessor,
  onChange,
  mode = 'edit',
  'data-test-subj': dataTestSubj,
}: PerOsReputationServiceProps<OS>): React.ReactElement | null => {
  const isPlatinumPlus = useLicense().isPlatinumPlus();
  const { cloud } = useKibana().services;
  const isCloud = cloud?.isCloudEnabled ?? false;
  const getTestId = useTestIdGenerator(dataTestSubj);
  const behaviorProtection = accessor.read().behavior_protection;
  const protectionTurnedOn = behaviorProtection.mode !== ProtectionModes.off;
  const checkboxChecked = behaviorProtection.reputation_service && protectionTurnedOn;

  const handleChange = useCallback<EuiCheckboxProps['onChange']>(
    (event) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        currentOsPolicy.behavior_protection.reputation_service = event.target.checked;
      });
      onChange({ isValid: true, updatedPolicy });
    },
    [accessor, onChange]
  );

  if (!isCloud || !isPlatinumPlus) {
    return null;
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="xs"
      responsive={false}
      data-test-subj={getTestId()}
    >
      <EuiFlexItem grow={false}>
        <EuiCheckbox
          data-test-subj={getTestId('checkbox')}
          id={`${dataTestSubj ?? 'behaviorProtection'}ReputationServiceCheckbox`}
          onChange={handleChange}
          checked={checkboxChecked}
          disabled={!protectionTurnedOn || mode !== 'edit'}
          label={i18n.translate('xpack.securitySolution.endpoint.policyDetail.reputationService', {
            defaultMessage: 'Reputation service',
          })}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false} data-test-subj={getTestId('tooltipIcon')}>
        <EuiIconTip
          position="right"
          data-test-subj={getTestId('tooltip')}
          content={
            <FormattedMessage
              id="xpack.securitySolution.endpoint.policyDetailsConfig.reputationServiceTooltip"
              defaultMessage="This option enables/disables the Reputation Service feature in Endpoint. When the option is ON, Endpoint will reach out to a Cloud API for additional detection coverage. When it's OFF, Endpoint will not reach out to the Cloud API, resulting in reduced efficacy."
            />
          }
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
