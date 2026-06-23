/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { truncate } from 'lodash';
import styled from 'styled-components';
import { EuiCopy, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { HostPolicyResponseAppliedArtifact } from '../../../../common/endpoint/types';

const StyledArtifactName = styled(EuiText)`
  white-space: nowrap;
  line-height: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledShaValue = styled(EuiText)`
  width: 80px;
  white-space: nowrap;
  line-height: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const IconContainer = styled(EuiText)`
  padding: 2px;
  border: ${({ theme }) => theme.eui.euiBorderThin};
  border-radius: ${({ theme }) => theme.eui.euiBorderRadiusSmall};
`;

interface PolicyResponseArtifactItemProps {
  artifact: HostPolicyResponseAppliedArtifact;
}

const COPY_TOOLTIP = {
  BEFORE: i18n.translate(
    'xpack.securitySolution.endpoint.details.policyResponse.artifact.copyButton.beforeCopyTooltip',
    {
      defaultMessage: 'Copy artifact ID',
    }
  ),
  AFTER: i18n.translate(
    'xpack.securitySolution.endpoint.details.policyResponse.artifact.copyButton.afterCopyTooltip',
    {
      defaultMessage: 'Artifact ID copied!',
    }
  ),
};

export const PolicyResponseArtifactItem = memo(({ artifact }: PolicyResponseArtifactItemProps) => {
  return (
    <EuiFlexGroup
      direction="row"
      alignItems="center"
      justifyContent="spaceBetween"
      css={{ flexWrap: 'nowrap' }}
    >
      <EuiFlexItem grow={true} css={{ alignItems: 'flex-start' }} className={'eui-textTruncate'}>
        <EuiToolTip position="top" content={artifact.name} anchorClassName={'eui-textTruncate'}>
          <StyledArtifactName data-test-subj="endpointPolicyResponseArtifactName">
            {artifact.name}
          </StyledArtifactName>
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup
          direction="row"
          alignItems="center"
          justifyContent="flexEnd"
          gutterSize="s"
          css={{ flexWrap: 'nowrap' }}
        >
          <EuiFlexItem grow={false}>
            <IconContainer size={'xs'}>{'sha256'}</IconContainer>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <StyledShaValue data-test-subj="endpointPolicyResponseArtifactSha256">
              <EuiToolTip position="top" content={artifact.sha256}>
                <span tabIndex={0}>{truncate(artifact.sha256, { length: 12 })}</span>
              </EuiToolTip>
            </StyledShaValue>
          </EuiFlexItem>
          <EuiFlexItem grow={false} css={{ marginTop: '-4px' }}>
            <EuiCopy
              textToCopy={artifact.sha256}
              beforeMessage={COPY_TOOLTIP.BEFORE}
              afterMessage={COPY_TOOLTIP.AFTER}
            >
              {(copy) => (
                <EuiIcon
                  size="m"
                  color="primary"
                  type="copy"
                  aria-hidden={true}
                  onClick={copy}
                  data-test-subj="endpointPolicyResponseArtifactCopyButton"
                />
              )}
            </EuiCopy>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});

PolicyResponseArtifactItem.displayName = 'PolicyResponseArtifactItem';
