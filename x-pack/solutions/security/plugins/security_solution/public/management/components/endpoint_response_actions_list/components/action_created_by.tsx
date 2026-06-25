/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiAvatar, EuiFacetButton, EuiText, EuiToolTip } from '@elastic/eui';
import { SecurityPageName } from '@kbn/deeplinks-security';
import styled from '@emotion/styled';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { UX_MESSAGES } from '../translations';
import { SecuritySolutionLinkAnchor } from '../../../../common/components/links';
import { getRuleDetailsUrl } from '../../../../common/components/link_to';
import type { ActionDetails } from '../../../../../common/endpoint/types';

// Truncated usernames
const StyledFacetButtonBase = styled(EuiFacetButton)`
  padding-left: 0;
  cursor: default;

  .euiText {
    margin-top: 0.38rem;
    overflow-y: visible !important;
  }
`;
const StyledFacetButton = (props: React.ComponentProps<typeof EuiFacetButton>) => (
  <StyledFacetButtonBase {...props} title={undefined} />
);

export interface ActionCreatedByProps {
  action: ActionDetails;
  'data-test-subj'?: string;
}

/**
 * Display for who created the response action - either a user or as a result of a rule execution
 */
export const ActionCreatedBy = memo<ActionCreatedByProps>(
  ({ action: { createdBy, ruleId }, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    if (createdBy === 'unknown' && ruleId) {
      return (
        <EuiToolTip content={UX_MESSAGES.triggeredByRule} anchorClassName="eui-textTruncate">
          <SecuritySolutionLinkAnchor
            data-test-subj={getTestId('ruleName')}
            deepLinkId={SecurityPageName.rules}
            path={getRuleDetailsUrl(ruleId)}
          >
            <EuiText
              size="s"
              className="eui-textTruncate eui-fullWidth"
              data-test-subj={getTestId('userName')}
            >
              {UX_MESSAGES.triggeredByRule}
            </EuiText>
          </SecuritySolutionLinkAnchor>
        </EuiToolTip>
      );
    }
    return (
      <StyledFacetButton
        icon={
          <EuiAvatar
            aria-hidden={true}
            // We've a EuiTooltip that shows for createdBy below,
            // Thus we don't need to add a title tooltip as well.
            title=""
            name={createdBy}
            data-test-subj={getTestId('userAvatar')}
            size="s"
          />
        }
      >
        <EuiToolTip content={createdBy} anchorClassName="eui-textTruncate">
          <EuiText
            size="s"
            className="eui-textTruncate eui-fullWidth"
            data-test-subj={getTestId('userName')}
            tabIndex={0}
          >
            {createdBy}
          </EuiText>
        </EuiToolTip>
      </StyledFacetButton>
    );
  }
);
ActionCreatedBy.displayName = 'ActionCreatedBy';
