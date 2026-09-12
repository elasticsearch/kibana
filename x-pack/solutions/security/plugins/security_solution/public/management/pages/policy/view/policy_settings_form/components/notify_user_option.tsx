/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { cloneDeep } from 'lodash';
import type { EuiTextAreaProps, EuiCheckboxProps } from '@elastic/eui';
import {
  EuiSpacer,
  EuiFlexItem,
  EuiFlexGroup,
  EuiCheckbox,
  EuiIconTip,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';
import { PROTECTION_NOTICE_SUPPORTED_ENDPOINT_VERSION } from '../protection_notice_supported_endpoint_version';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { getEmptyValue } from '../../../../../../common/components/empty_value';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { SettingCardHeader } from './setting_card';
import type { PolicyFormComponentCommonProps } from '../types';
import type { ImmutableArray, UIPolicyConfig } from '../../../../../../../common/endpoint/types';
import { PolicyOperatingSystem, ProtectionModes } from '../../../../../../../common/endpoint/types';
import { setPopupEnabled } from '../../../../../../../common/endpoint/models/policy_config_helpers';
import type { PolicyProtection, MacPolicyProtection, LinuxPolicyProtection } from '../../../types';
import { useGetCustomNotificationUnavailableComponent } from '../hooks/use_get_custom_notification_unavailable_component';
import {
  NOTIFY_USER_SECTION_TITLE,
  NOTIFY_USER_CHECKBOX_LABEL,
  NOTIFICATION_MESSAGE_LABEL,
  CUSTOMIZE_NOTIFICATION_MESSAGE_LABEL,
} from './shared_translations';

export interface NotifyUserOptionProps extends PolicyFormComponentCommonProps {
  protection: PolicyProtection;
  osList: ImmutableArray<Partial<keyof UIPolicyConfig>>;
}

export const NotifyUserOption = React.memo(
  ({
    policy,
    onChange,
    mode,
    protection,
    osList,
    'data-test-subj': dataTestSubj,
  }: NotifyUserOptionProps) => {
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const getTestId = useTestIdGenerator(dataTestSubj);
    const CustomNotificationUpsellingComponent = useGetCustomNotificationUnavailableComponent();

    const isEditMode = mode === 'edit';
    const selected = policy.windows[protection].mode;
    const userNotificationSelected = policy.windows.popup[protection].enabled;
    const userNotificationMessage = policy.windows.popup[protection].message;

    const handleUserNotificationCheckbox = useCallback<EuiCheckboxProps['onChange']>(
      (event) => {
        const newPayload = cloneDeep(policy);
        setPopupEnabled(newPayload, protection, osList, event.target.checked);

        onChange({ isValid: true, updatedPolicy: newPayload });
      },
      [policy, onChange, osList, protection]
    );

    const handleCustomUserNotification = useCallback<NonNullable<EuiTextAreaProps['onChange']>>(
      (event) => {
        const newPayload = cloneDeep(policy);
        for (const os of osList) {
          if (os === PolicyOperatingSystem.windows) {
            newPayload[os].popup[protection].message = event.target.value;
          } else if (os === PolicyOperatingSystem.mac) {
            newPayload[os].popup[protection as MacPolicyProtection].message = event.target.value;
          } else if (os === PolicyOperatingSystem.linux) {
            newPayload[os].popup[protection as LinuxPolicyProtection].message = event.target.value;
          }
        }

        onChange({ isValid: true, updatedPolicy: newPayload });
      },
      [policy, onChange, osList, protection]
    );

    const tooltipProtectionText = useCallback((protectionType: PolicyProtection) => {
      if (protectionType === 'memory_protection') {
        return i18n.translate(
          'xpack.securitySolution.endpoint.policyDetail.memoryProtectionTooltip',
          {
            defaultMessage: 'memory threat',
          }
        );
      } else if (protectionType === 'behavior_protection') {
        return i18n.translate(
          'xpack.securitySolution.endpoint.policyDetail.behaviorProtectionTooltip',
          {
            defaultMessage: 'malicious behavior',
          }
        );
      } else {
        return protectionType;
      }
    }, []);

    const tooltipBracketText = useCallback(
      (protectionType: PolicyProtection) => {
        if (protectionType === 'memory_protection' || protection === 'behavior_protection') {
          return i18n.translate('xpack.securitySolution.endpoint.policyDetail.rule', {
            defaultMessage: 'rule',
          });
        } else {
          return i18n.translate('xpack.securitySolution.endpoint.policyDetail.filename', {
            defaultMessage: 'filename',
          });
        }
      },
      [protection]
    );

    const customNotificationComponent = useMemo(() => {
      if (!userNotificationSelected) {
        return null;
      }

      if (CustomNotificationUpsellingComponent) {
        return <CustomNotificationUpsellingComponent />;
      }

      if (!isEditMode) {
        return (
          <>
            <EuiSpacer size="m" />
            <EuiText size="s">
              <h4>{NOTIFICATION_MESSAGE_LABEL}</h4>
            </EuiText>
            <EuiSpacer size="xs" />
            <>{userNotificationMessage || getEmptyValue()}</>
          </>
        );
      }

      return (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem grow={false}>
              <EuiText size="s" data-test-subj={getTestId('customMessageTitle')}>
                <h4>{CUSTOMIZE_NOTIFICATION_MESSAGE_LABEL}</h4>
              </EuiText>
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
                      values={{
                        protectionName: tooltipProtectionText(protection),
                      }}
                    />
                    <EuiSpacer size="m" />
                    <FormattedMessage
                      id="xpack.securitySolution.endpoint.policyDetailsConfig.notifyUserTooltip.c"
                      defaultMessage="
                      The user notification can be customized in the text box below. Bracketed tags can be used to dynamically populate the applicable action (such as prevented or detected) and the { bracketText }."
                      values={{
                        bracketText: tooltipBracketText(protection),
                      }}
                    />
                  </>
                }
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          <EuiTextArea
            placeholder={i18n.translate(
              'xpack.securitySolution.endpoint.policyDetails.userNotification.placeholder',
              {
                defaultMessage: 'Input your custom notification message',
              }
            )}
            value={userNotificationMessage}
            onChange={handleCustomUserNotification}
            fullWidth={true}
            disabled={!isEditMode}
            data-test-subj={getTestId('customMessage')}
          />
        </>
      );
    }, [
      CustomNotificationUpsellingComponent,
      getTestId,
      handleCustomUserNotification,
      isEditMode,
      protection,
      tooltipBracketText,
      tooltipProtectionText,
      userNotificationMessage,
      userNotificationSelected,
    ]);

    if (!isPlatinumPlus) {
      return null;
    }

    return (
      <div data-test-subj={getTestId()}>
        <EuiSpacer size="m" />
        <SettingCardHeader data-test-subj={getTestId('title')}>
          {NOTIFY_USER_SECTION_TITLE}
        </SettingCardHeader>

        <SupportedVersionForProtectionNotice
          protection={protection}
          data-test-subj={getTestId('supportedVersion')}
        />

        <EuiSpacer size="s" />

        <EuiCheckbox
          data-test-subj={getTestId('checkbox')}
          id={`${protection}UserNotificationCheckbox}`}
          onChange={handleUserNotificationCheckbox}
          checked={userNotificationSelected}
          disabled={!isEditMode || selected === ProtectionModes.off}
          label={NOTIFY_USER_CHECKBOX_LABEL}
        />

        {customNotificationComponent}
      </div>
    );
  }
);
NotifyUserOption.displayName = 'NotifyUserOption';

export const SupportedVersionForProtectionNotice = React.memo(
  ({
    protection,
    'data-test-subj': dataTestSubj,
  }: {
    protection: string;
    'data-test-subj'?: string;
  }) => {
    const version = useMemo(() => {
      return PROTECTION_NOTICE_SUPPORTED_ENDPOINT_VERSION[
        protection as keyof typeof PROTECTION_NOTICE_SUPPORTED_ENDPOINT_VERSION
      ];
    }, [protection]);

    if (!version) {
      return null;
    }

    return (
      <EuiText color="subdued" size="xs" data-test-subj={dataTestSubj}>
        <i>
          <FormattedMessage
            id="xpack.securitySolution.endpoint.policyDetails.supportedVersion"
            defaultMessage="Agent version {version}"
            values={{ version }}
          />
        </i>
      </EuiText>
    );
  }
);
SupportedVersionForProtectionNotice.displayName = 'SupportedVersionForProtectionNotice';
