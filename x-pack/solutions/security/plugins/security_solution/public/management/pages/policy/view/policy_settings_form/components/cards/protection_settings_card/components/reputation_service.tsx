/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import type { EuiCheckboxProps } from '@elastic/eui';
import {
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { cloneDeep } from 'lodash';
import { useKibana } from '../../../../../../../../../common/lib/kibana';
import { useTestIdGenerator } from '../../../../../../../../hooks/use_test_id_generator';
import { SettingCardHeader } from '../../../setting_card';
import type { PolicyProtection } from '../../../../../../types';
import type { PolicyFormComponentCommonProps } from '../../../../types';
import { ProtectionModes } from '../../../../../../../../../../common/endpoint/types';
import { setBehaviorReputationService } from '../../../../../../../../../../common/endpoint/models/policy_config_helpers';

interface ReputationServiceProps extends PolicyFormComponentCommonProps {
  protection: PolicyProtection;
}

export const ReputationService = React.memo(
  ({
    policy,
    onChange,
    mode,
    protection,
    'data-test-subj': dataTestSubj,
  }: ReputationServiceProps) => {
    const isEditMode = mode === 'edit';

    const { cloud } = useKibana().services;
    const isCloud = cloud?.isCloudEnabled ?? false;

    const getTestId = useTestIdGenerator(dataTestSubj);

    const protectionTurnedOn = policy.windows.behavior_protection.mode !== ProtectionModes.off;

    const checkboxChecked =
      policy.windows.behavior_protection.reputation_service && protectionTurnedOn;

    const handleChange = useCallback<EuiCheckboxProps['onChange']>(
      (event) => {
        const newPayload = cloneDeep(policy);
        setBehaviorReputationService(newPayload, event.target.checked);

        onChange({ isValid: true, updatedPolicy: newPayload });
      },
      [policy, onChange]
    );

    if (!isCloud) {
      return null;
    }

    return (
      <div data-test-subj={getTestId()}>
        <EuiSpacer size="m" />
        <SettingCardHeader>
          <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem grow={false} data-test-subj={getTestId('label')}>
              <EuiText size="s">
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.endpoint.policyDetailsConfig.reputationService"
                    defaultMessage="Reputation service"
                  />
                </h4>
              </EuiText>
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
        </SettingCardHeader>
        <EuiSpacer size="s" />
        <EuiCheckbox
          data-test-subj={getTestId('checkbox')}
          id={`${protection}ReputationServiceCheckbox}`}
          onChange={handleChange}
          checked={checkboxChecked}
          disabled={!protectionTurnedOn || !isEditMode}
          label={i18n.translate('xpack.securitySolution.endpoint.policyDetail.reputationService', {
            defaultMessage: 'Reputation service',
          })}
        />
      </div>
    );
  }
);

ReputationService.displayName = 'ReputationService';
