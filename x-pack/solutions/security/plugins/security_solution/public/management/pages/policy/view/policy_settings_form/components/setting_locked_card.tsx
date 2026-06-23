/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiCard,
  EuiIcon,
  EuiTextColor,
  EuiLink,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import styled from 'styled-components';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';

const LockedPolicyDiv = styled.div`
  .euiCard__betaBadgeWrapper {
    .euiCard__betaBadge {
      width: auto;
    }
  }
  .lockedCardDescription {
    padding: 0 33.3%;
  }
`;

export interface SettingLockedCardProps {
  title: string;
  licenseType?: 'platinum' | 'enterprise';
  'data-test-subj'?: string;
}

export const SettingLockedCard = React.memo<SettingLockedCardProps>(
  ({ title, licenseType = 'platinum', 'data-test-subj': dataTestSubj }: SettingLockedCardProps) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    const licenseDisplayName =
      licenseType === 'enterprise'
        ? i18n.translate('xpack.securitySolution.endpoint.policy.details.enterprise', {
            defaultMessage: 'Enterprise',
          })
        : i18n.translate('xpack.securitySolution.endpoint.policy.details.platinum', {
            defaultMessage: 'Platinum',
          });

    return (
      <LockedPolicyDiv>
        <EuiCard
          data-test-subj={getTestId()}
          betaBadgeProps={{
            'data-test-subj': getTestId('badge'),
            label: licenseDisplayName,
          }}
          isDisabled={true}
          icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
          title={
            <h3 data-test-subj={getTestId('title')}>
              <strong>{title}</strong>
            </h3>
          }
          description={false}
        >
          <EuiFlexGroup className="lockedCardDescription" direction="column" gutterSize="none">
            <EuiText>
              <EuiFlexItem>
                <h4>
                  <EuiTextColor color="subdued">
                    <FormattedMessage
                      id="xpack.securitySolution.endpoint.policy.details.upgradeToLicense"
                      defaultMessage="Upgrade to Elastic {licenseType}"
                      values={{
                        licenseType: licenseDisplayName,
                      }}
                    />
                  </EuiTextColor>
                </h4>
              </EuiFlexItem>
              <EuiFlexItem>
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.endpoint.policy.details.lockedCardUpgradeMessage"
                    defaultMessage="To turn on this protection, you must upgrade your license to {licenseType}, start a free 30-day trial, or spin up a {cloudDeploymentLink} on AWS, GCP, or Azure."
                    values={{
                      licenseType: licenseDisplayName,
                      cloudDeploymentLink: (
                        <EuiLink
                          href="https://www.elastic.co/cloud/"
                          target="_blank"
                          data-test-subj={getTestId('cloudLink')}
                        >
                          <FormattedMessage
                            id="xpack.securitySolution.endpoint.policy.details.cloudDeploymentLInk"
                            defaultMessage="cloud deployment"
                          />
                        </EuiLink>
                      ),
                    }}
                  />
                </p>
              </EuiFlexItem>
            </EuiText>
          </EuiFlexGroup>
        </EuiCard>
      </LockedPolicyDiv>
    );
  }
);
SettingLockedCard.displayName = 'SettingLockedCard';
