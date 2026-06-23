/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect } from 'react';
import {
  EuiText,
  EuiSpacer,
  EuiCodeBlock,
  EuiCallOut,
  EuiButton,
  EuiCopy,
  EuiFilterGroup,
  EuiFilterButton,
  EuiPopover,
  EuiSelectable,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';

import {
  FLEET_CLOUD_SECURITY_POSTURE_KSPM_POLICY_TEMPLATE,
  FLEET_CLOUD_SECURITY_POSTURE_CSPM_POLICY_TEMPLATE,
} from '../../common/constants/epm';
import {
  usePlatform,
  VISIBLE_PLATFORM_OPTIONS,
  EXTENDED_PLATFORM_OPTIONS,
  KUBERNETES_PLATFORM_OPTION,
} from '../hooks';

import type { CommandsByPlatform } from '../applications/fleet/components/fleet_server_instructions/utils';

import { KubernetesInstructions } from './agent_enrollment_flyout/kubernetes_instructions';
import type { CloudSecurityIntegration } from './agent_enrollment_flyout/types';

interface Props {
  installCommand: CommandsByPlatform;
  hasK8sIntegration: boolean;
  cloudSecurityIntegration?: CloudSecurityIntegration | undefined;
  hasK8sIntegrationMultiPage: boolean;
  isManaged?: boolean;
  hasFleetServer?: boolean;
  enrollToken?: string | undefined;
  fullCopyButton?: boolean;
  fleetServerHost?: string;
  onCopy?: () => void;
}

export const PlatformSelector: React.FunctionComponent<Props> = ({
  installCommand,
  hasK8sIntegration,
  cloudSecurityIntegration,
  hasK8sIntegrationMultiPage,
  isManaged,
  enrollToken,
  hasFleetServer,
  fleetServerHost,
  fullCopyButton,
  onCopy,
}) => {
  const { platform, setPlatform } = usePlatform();
  const [showExtendedPlatforms, setShowExtendedPlatforms] = useState(false);

  useEffect(() => {
    if (
      hasK8sIntegration ||
      (cloudSecurityIntegration?.integrationType ===
        FLEET_CLOUD_SECURITY_POSTURE_KSPM_POLICY_TEMPLATE &&
        isManaged)
    ) {
      setPlatform('kubernetes');
    }
  }, [hasK8sIntegration, cloudSecurityIntegration, isManaged, setPlatform]);

  // Show K8 as a platform option if policy has K8s integration or is managed
  const showK8 = !hasFleetServer && (isManaged || hasK8sIntegration);
  const extendedPlatformOptions = [
    ...(showK8 ? [KUBERNETES_PLATFORM_OPTION] : []),
    ...EXTENDED_PLATFORM_OPTIONS,
  ];
  const extendedPlatforms = extendedPlatformOptions.map((option) => option.id);

  const [copyButtonClicked, setCopyButtonClicked] = useState(false);

  const systemPackageCallout = (
    <EuiCallOut
      title={i18n.translate('xpack.fleet.enrollmentInstructions.callout', {
        defaultMessage:
          'We recommend using the installers (TAR/ZIP) over system packages (RPM/DEB) because they provide the ability to upgrade your agent with Fleet.',
      })}
      color="warning"
      iconType="warning"
    />
  );

  const k8sCallout = (
    <EuiCallOut
      title={i18n.translate('xpack.fleet.enrollmentInstructions.k8sCallout', {
        defaultMessage:
          'We recommend adding the Kubernetes integration to your agent policy in order to get useful metrics and logs from your Kubernetes clusters.',
      })}
      color="warning"
      iconType="warning"
    />
  );

  const k8sCSPMCallout = (
    <EuiCallOut
      title={i18n.translate('xpack.fleet.enrollmentInstructions.placeHolderCallout', {
        defaultMessage:
          'We strongly advise against deploying CSPM within a Kubernetes cluster. Doing so may lead to redundant data fetching, which can cause increased consumption costs within your Elastic account and potentially trigger API rate limiting in your cloud account(s).',
      })}
      color="warning"
      iconType="warning"
    />
  );

  const macCallout = (
    <EuiCallOut
      title={i18n.translate('xpack.fleet.enrollmentInstructions.macCallout', {
        defaultMessage:
          'We recommend against deploying this integration within Mac as it is currently not being supported.',
      })}
      color="warning"
      iconType="warning"
    />
  );

  const onTextAreaClick = () => {
    if (onCopy) onCopy();
  };
  const onCopyButtonClick = (copy: () => void) => {
    copy();
    setCopyButtonClicked(true);
    if (onCopy) onCopy();
  };

  return (
    <>
      <>
        {!hasK8sIntegrationMultiPage && (
          <EuiFilterGroup
            aria-label={i18n.translate('xpack.fleet.agentEnrollment.visiblePlatformSelectorLabel', {
              defaultMessage: 'Platform options',
            })}
          >
            {VISIBLE_PLATFORM_OPTIONS.map((option) => (
              <EuiFilterButton
                key={option.id}
                isToggle
                isSelected={platform === option.id}
                hasActiveFilters={platform === option.id}
                onClick={() => setPlatform(option.id)}
                data-test-subj={option['data-test-subj']}
              >
                {option.label}
              </EuiFilterButton>
            ))}
            <EuiPopover
              aria-label={i18n.translate('xpack.fleet.agentEnrollment.morePlatformsLabel', {
                defaultMessage: 'More platforms',
              })}
              button={
                <EuiFilterButton
                  iconType="chevronSingleDown"
                  data-test-subj="platformSelectorExtended"
                  onClick={() => setShowExtendedPlatforms(!showExtendedPlatforms)}
                  isSelected={showExtendedPlatforms}
                  hasActiveFilters={extendedPlatforms.includes(platform)}
                  numActiveFilters={extendedPlatforms.includes(platform) ? 1 : 0}
                  aria-label={i18n.translate('xpack.fleet.agentEnrollment.morePlatformsLabel', {
                    defaultMessage: 'More platforms',
                  })}
                  css={css`
                    .euiFilterButton__text {
                      min-inline-size: 0;
                    }
                  `}
                >
                  &hellip;
                </EuiFilterButton>
              }
              isOpen={showExtendedPlatforms}
              closePopover={() => setShowExtendedPlatforms(false)}
              panelPaddingSize="s"
              repositionOnScroll={true}
            >
              <EuiSelectable
                aria-label={i18n.translate(
                  'xpack.fleet.agentEnrollment.extendedPlatformSelectorLabel',
                  {
                    defaultMessage: 'Additional platform options',
                  }
                )}
                singleSelection={true}
                options={extendedPlatformOptions.map((option) => ({
                  key: option.id,
                  label: option.label,
                  checked: platform === option.id ? 'on' : undefined,
                  'data-test-subj': option['data-test-subj'],
                }))}
                onChange={(_allOptions, _event, option) => {
                  setPlatform(option.key);
                  setShowExtendedPlatforms(false);
                }}
                css={{ width: 150 }}
                listProps={{ onFocusBadge: false }}
              >
                {(list) => list}
              </EuiSelectable>
            </EuiPopover>
          </EuiFilterGroup>
        )}
        <EuiSpacer size="m" />
        {['deb_aarch64', 'deb_x86_64', 'rpm_aarch64', 'rpm_x86_64'].includes(platform) && (
          <>
            {systemPackageCallout}
            <EuiSpacer size="m" />
          </>
        )}
        {['mac_aarch64', 'mac_x86_64'].includes(platform) &&
          (cloudSecurityIntegration?.integrationType ===
            FLEET_CLOUD_SECURITY_POSTURE_CSPM_POLICY_TEMPLATE ||
            cloudSecurityIntegration?.integrationType ===
              FLEET_CLOUD_SECURITY_POSTURE_KSPM_POLICY_TEMPLATE) && (
            <>
              {macCallout}
              <EuiSpacer size="m" />
            </>
          )}
        {platform === 'kubernetes' &&
          cloudSecurityIntegration?.integrationType ===
            FLEET_CLOUD_SECURITY_POSTURE_CSPM_POLICY_TEMPLATE && (
            <>
              {k8sCSPMCallout}
              <EuiSpacer size="m" />
            </>
          )}
        {platform === 'kubernetes' && !hasK8sIntegration && (
          <>
            {k8sCallout}
            <EuiSpacer size="m" />
          </>
        )}
        {platform === 'kubernetes' && isManaged && (
          <>
            <KubernetesInstructions
              onCopy={onCopy}
              onDownload={onCopy}
              enrollmentAPIKey={enrollToken}
              fleetServerHost={fleetServerHost}
            />
            <EuiSpacer size="s" />
          </>
        )}
        {!hasK8sIntegrationMultiPage && (
          <>
            {platform === 'kubernetes' && (
              <EuiText>
                <EuiSpacer size="s" />
                <FormattedMessage
                  id="xpack.fleet.agentEnrollment.kubernetesCommandInstructions"
                  defaultMessage="From the directory where the manifest is downloaded, run the apply command."
                />
                <EuiSpacer size="m" />
              </EuiText>
            )}

            <EuiCodeBlock
              data-test-subj="enrollmentInstructionsCodeBlock"
              onClick={onTextAreaClick}
              fontSize="m"
              isCopyable={!fullCopyButton}
              paddingSize="m"
              css={css`
                max-width: 1100px;
              `}
              whiteSpace="pre"
            >
              {installCommand[platform]}
            </EuiCodeBlock>

            <EuiSpacer size="s" />
            {fullCopyButton && (
              <EuiCopy textToCopy={installCommand[platform]}>
                {(copy) => (
                  <EuiButton
                    color="primary"
                    iconType="copy"
                    size="m"
                    onClick={() => onCopyButtonClick(copy)}
                  >
                    {copyButtonClicked ? (
                      <FormattedMessage
                        id="xpack.fleet.enrollmentInstructions.copyButtonClicked"
                        defaultMessage="Copied"
                      />
                    ) : (
                      <FormattedMessage
                        id="xpack.fleet.enrollmentInstructions.copyButton"
                        defaultMessage="Copy to clipboard"
                      />
                    )}
                  </EuiButton>
                )}
              </EuiCopy>
            )}
          </>
        )}
      </>
    </>
  );
};
