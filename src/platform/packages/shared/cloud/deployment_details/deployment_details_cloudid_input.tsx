/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, type FC } from 'react';
import {
  EuiButtonIcon,
  EuiCopy,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiPopover,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

const LearnMoreLink: FC<{ learnMoreUrl: string }> = ({ learnMoreUrl }) => (
  <EuiLink href={learnMoreUrl}>
    {i18n.translate('cloud.deploymentDetails.cloudIDLabelToolip.learnMoreLink', {
      defaultMessage: 'Learn more',
    })}
  </EuiLink>
);

const Label: FC<{ learnMoreUrl: string }> = ({ learnMoreUrl }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <EuiFlexGroup css={{ minWidth: 200, height: 16 }} alignItems="center" gutterSize="xs">
      <EuiFlexItem grow={false}>
        <EuiText size="xs" css={{ fontWeight: 600 }}>
          {i18n.translate('cloud.deploymentDetails.cloudIDLabel', {
            defaultMessage: 'Cloud ID',
          })}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiPopover
          aria-label={i18n.translate('cloud.deploymentDetails.cloudIdHelpPopover.ariaLabel', {
            defaultMessage: 'Cloud ID help',
          })}
          button={
            <EuiToolTip
              content={i18n.translate('cloud.deploymentDetails.cloudIdHelpButton.ariaLabel', {
                defaultMessage: 'Show Cloud ID help',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                iconType="question"
                onClick={() => {
                  setIsPopoverOpen(true);
                }}
                aria-label={i18n.translate('cloud.deploymentDetails.cloudIdHelpButton.ariaLabel', {
                  defaultMessage: 'Show Cloud ID help',
                })}
              />
            </EuiToolTip>
          }
          isOpen={isPopoverOpen}
          closePopover={() => {
            setIsPopoverOpen(false);
          }}
          anchorPosition="upCenter"
        >
          <p style={{ width: 270 }}>
            <FormattedMessage
              id="cloud.deploymentDetails.cloudIDLabelToolip"
              defaultMessage="Get started with Elastic Agent or Logstash quickly. The Cloud ID simplifies sending data to Elastic. {link}"
              values={{ link: <LearnMoreLink learnMoreUrl={learnMoreUrl} /> }}
            />
          </p>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const DeploymentDetailsCloudIdInput: FC<{ cloudId: string; learnMoreUrl: string }> = ({
  cloudId,
  learnMoreUrl,
}) => {
  return (
    <EuiFormRow label={<Label learnMoreUrl={learnMoreUrl} />} fullWidth>
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>
          <EuiFieldText
            value={cloudId}
            fullWidth
            disabled
            data-test-subj="deploymentDetailsCloudID"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiCopy textToCopy={cloudId}>
            {(copy) => (
              <EuiToolTip
                content={i18n.translate('cloud.deploymentDetails.copyCloudIdButton.ariaLabel', {
                  defaultMessage: 'Copy Cloud ID',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  onClick={copy}
                  iconType="copy"
                  display="base"
                  size="m"
                  aria-label={i18n.translate(
                    'cloud.deploymentDetails.copyCloudIdButton.ariaLabel',
                    {
                      defaultMessage: 'Copy Cloud ID',
                    }
                  )}
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFormRow>
  );
};
