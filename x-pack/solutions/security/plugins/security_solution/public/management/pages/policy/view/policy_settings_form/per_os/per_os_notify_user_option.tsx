/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import type { EuiCheckboxProps, EuiFieldTextProps } from '@elastic/eui';
import {
  EuiCheckbox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { PolicyConfig, ProtectionFields } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type {
  BehaviorProtectionOSes,
  MalwareProtectionOSes,
  MemoryProtectionOSes,
  PolicyProtection,
  RansomwareProtectionOSes,
} from '../../../types';
import { useGetCustomNotificationUnavailableComponent } from '../hooks/use_get_custom_notification_unavailable_component';
import { NOTIFY_USER_CHECKBOX_LABEL } from '../components/shared_translations';
import { SupportedVersionForProtectionNotice } from '../components/notify_user_option';
import { osRowPanelCss } from './os_control_layout';
import type { PerOsPolicyAccessor } from './policy_accessor';

interface ProtectionOperatingSystems {
  malware: MalwareProtectionOSes;
  memory_protection: MemoryProtectionOSes;
  behavior_protection: BehaviorProtectionOSes;
  ransomware: RansomwareProtectionOSes;
}

interface NotificationFields {
  enabled: boolean;
  message: string;
}

type NotificationPolicyBranch<Protection extends PolicyProtection> = {
  [Key in Protection]: ProtectionFields;
} & {
  popup: { [Key in Protection]: NotificationFields };
};
type ReadonlyNotificationPolicyBranch<Protection extends PolicyProtection> = {
  readonly [Key in Protection]: Readonly<ProtectionFields>;
} & {
  readonly popup: { readonly [Key in Protection]: Readonly<NotificationFields> };
};

export interface PerOsNotifyUserOptionProps<
  Protection extends PolicyProtection = PolicyProtection,
  OS extends ProtectionOperatingSystems[Protection] = ProtectionOperatingSystems[Protection]
> {
  accessor: PerOsPolicyAccessor<OS>;
  onChange: (options: { isValid: boolean; updatedPolicy: PolicyConfig }) => void;
  mode?: 'edit' | 'view';
  protection: Protection;
  'data-test-subj'?: string;
}

interface PerOsNotifyUserOptionComponent {
  <Protection extends PolicyProtection, OS extends ProtectionOperatingSystems[Protection]>(
    props: PerOsNotifyUserOptionProps<Protection, OS>
  ): React.ReactElement | null;
  displayName?: string;
}

const PerOsNotifyUserOptionComponent = <
  Protection extends PolicyProtection,
  OS extends ProtectionOperatingSystems[Protection]
>({
  accessor,
  onChange,
  mode = 'edit',
  protection,
  'data-test-subj': dataTestSubj,
}: PerOsNotifyUserOptionProps<Protection, OS>): React.ReactElement | null => {
  const isPlatinumPlus = useLicense().isPlatinumPlus();
  const getTestId = useTestIdGenerator(dataTestSubj);
  const CustomNotificationUpsellingComponent = useGetCustomNotificationUnavailableComponent();
  const isEditMode = mode === 'edit';
  const osPolicy = accessor.read() as ReadonlyNotificationPolicyBranch<Protection>;
  const selected = osPolicy[protection].mode;
  const userNotificationSelected = osPolicy.popup[protection].enabled;
  const userNotificationMessage = osPolicy.popup[protection].message;

  const handleUserNotificationCheckbox = useCallback<EuiCheckboxProps['onChange']>(
    (event) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        const notificationPolicy = currentOsPolicy as PolicyConfig[OS] &
          NotificationPolicyBranch<Protection>;
        notificationPolicy.popup[protection].enabled = event.target.checked;
      });
      onChange({ isValid: true, updatedPolicy });
    },
    [accessor, onChange, protection]
  );

  const handleCustomUserNotification = useCallback<NonNullable<EuiFieldTextProps['onChange']>>(
    (event) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        const notificationPolicy = currentOsPolicy as PolicyConfig[OS] &
          NotificationPolicyBranch<Protection>;
        notificationPolicy.popup[protection].message = event.target.value;
      });
      onChange({ isValid: true, updatedPolicy });
    },
    [accessor, onChange, protection]
  );

  const tooltipProtectionText = useCallback((protectionType: PolicyProtection) => {
    if (protectionType === 'memory_protection') {
      return i18n.translate(
        'xpack.securitySolution.endpoint.policyDetail.memoryProtectionTooltip',
        { defaultMessage: 'memory threat' }
      );
    }

    if (protectionType === 'behavior_protection') {
      return i18n.translate(
        'xpack.securitySolution.endpoint.policyDetail.behaviorProtectionTooltip',
        { defaultMessage: 'malicious behavior' }
      );
    }

    return protectionType;
  }, []);

  const tooltipBracketText = useCallback((protectionType: PolicyProtection) => {
    if (protectionType === 'memory_protection' || protectionType === 'behavior_protection') {
      return i18n.translate('xpack.securitySolution.endpoint.policyDetail.rule', {
        defaultMessage: 'rule',
      });
    }

    return i18n.translate('xpack.securitySolution.endpoint.policyDetail.filename', {
      defaultMessage: 'filename',
    });
  }, []);

  const customNotificationComponent = CustomNotificationUpsellingComponent ? (
    <CustomNotificationUpsellingComponent />
  ) : (
    <EuiFieldText
      placeholder={i18n.translate(
        'xpack.securitySolution.endpoint.policyDetails.customizeMessagePlaceholder',
        { defaultMessage: 'Customize message' }
      )}
      aria-label={i18n.translate(
        'xpack.securitySolution.endpoint.policyDetails.customizeMessageAriaLabel',
        { defaultMessage: 'Customize message' }
      )}
      value={userNotificationMessage}
      onChange={handleCustomUserNotification}
      disabled={!isEditMode || !userNotificationSelected || selected === ProtectionModes.off}
      fullWidth={true}
      data-test-subj={getTestId('customMessage')}
    />
  );

  if (!isPlatinumPlus) {
    return null;
  }

  return (
    <EuiPanel
      color="subdued"
      paddingSize="s"
      hasShadow={false}
      data-test-subj={getTestId()}
      css={osRowPanelCss}
    >
      <EuiFlexGroup alignItems="center" gutterSize="m" wrap={true}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiCheckbox
                data-test-subj={getTestId('checkbox')}
                id={`${dataTestSubj ?? protection}UserNotificationCheckbox`}
                onChange={handleUserNotificationCheckbox}
                checked={userNotificationSelected}
                disabled={!isEditMode || selected === ProtectionModes.off}
                label={NOTIFY_USER_CHECKBOX_LABEL}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiIconTip
                position="right"
                data-test-subj={getTestId('tooltipInfo')}
                anchorProps={{ 'data-test-subj': getTestId('tooltipIcon') }}
                content={
                  <>
                    <FormattedMessage
                      id="xpack.securitySolution.endpoint.policyDetailsConfig.notifyUserTooltip.a"
                      defaultMessage="Selecting the user notification option will display a notification to the host user when { protectionName } is prevented or detected."
                      values={{ protectionName: tooltipProtectionText(protection) }}
                    />
                    <EuiSpacer size="m" />
                    <FormattedMessage
                      id="xpack.securitySolution.endpoint.policyDetailsConfig.notifyUserTooltip.c"
                      defaultMessage="The user notification can be customized in the text box below. Bracketed tags can be used to dynamically populate the applicable action (such as prevented or detected) and the { bracketText }."
                      values={{ bracketText: tooltipBracketText(protection) }}
                    />
                    <EuiSpacer size="s" />
                    <SupportedVersionForProtectionNotice
                      protection={protection}
                      data-test-subj={getTestId('supportedVersion')}
                    />
                  </>
                }
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>{customNotificationComponent}</EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

export const PerOsNotifyUserOption = memo(
  PerOsNotifyUserOptionComponent
) as PerOsNotifyUserOptionComponent;
PerOsNotifyUserOption.displayName = 'PerOsNotifyUserOption';
