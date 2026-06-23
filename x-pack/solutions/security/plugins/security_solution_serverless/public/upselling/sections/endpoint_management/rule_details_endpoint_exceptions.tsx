/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiCard, EuiIcon } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';

const BADGE_TEXT = i18n.translate(
  'xpack.securitySolutionServerless.rules.endpointSecurity.endpointExceptions.badgeText',
  {
    defaultMessage: 'Endpoint Essentials',
  }
);
const CARD_TITLE = i18n.translate(
  'xpack.securitySolutionServerless.rules.endpointSecurity.endpointExceptions.cardTitle',
  {
    defaultMessage: 'Do more with Security!',
  }
);
const CARD_MESSAGE = i18n.translate(
  'xpack.securitySolutionServerless.rules.endpointSecurity.endpointExceptions.cardMessage',
  {
    defaultMessage:
      'Upgrade your license to {productTypeRequired} to use Endpoint Security Exception List.',
    values: { productTypeRequired: BADGE_TEXT },
  }
);

const CardDescription = styled.p`
  padding: 0 33.3%;
`;

/**
 * Component displayed trying to access endpoint exceptions tab on Endpoint security rule details.
 */
export const RuleDetailsEndpointExceptions = memo(() => {
  return (
    <EuiCard
      data-test-subj="endpointPolicy-protectionsLockedCard"
      isDisabled={true}
      description={false}
      icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
      betaBadgeProps={{
        'data-test-subj': 'rules-endpointSecurity-endpointExceptionsLockedCard-badge',
        label: BADGE_TEXT,
      }}
      title={
        <h3 data-test-subj="rules-endpointSecurity-endpointExceptionsLockedCard-title">
          <strong>{CARD_TITLE}</strong>
        </h3>
      }
    >
      <CardDescription>{CARD_MESSAGE}</CardDescription>
    </EuiCard>
  );
});
RuleDetailsEndpointExceptions.displayName = 'RuleDetailsEndpointExceptions';
