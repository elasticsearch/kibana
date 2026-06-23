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

const CARD_TITLE = i18n.translate(
  'xpack.securitySolutionServerless.endpointPolicyProtections.cardTitle',
  {
    defaultMessage: 'Policy Protections',
  }
);
const CARD_MESSAGE = i18n.translate(
  'xpack.securitySolutionServerless.endpointPolicyProtections.cardMessage',
  {
    defaultMessage:
      'To turn on policy protections, like malware, ransomware and others, you must add at least Endpoint Essentials to your project. ',
  }
);
const BADGE_TEXT = i18n.translate(
  'xpack.securitySolutionServerless.endpointPolicyProtections.badgeText',
  {
    defaultMessage: 'Endpoint Essentials',
  }
);

const CardDescription = styled.p`
  padding: 0 33.3%;
`;

/**
 * Component displayed when a given product tier is not allowed to use endpoint policy protections.
 */
export const EndpointPolicyProtections = memo(() => {
  return (
    <EuiCard
      data-test-subj="endpointPolicy-protectionsLockedCard"
      isDisabled={true}
      description={false}
      icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
      betaBadgeProps={{
        'data-test-subj': 'endpointPolicy-protectionsLockedCard-badge',
        label: BADGE_TEXT,
      }}
      title={
        <h3 data-test-subj="endpointPolicy-protectionsLockedCard-title">
          <strong>{CARD_TITLE}</strong>
        </h3>
      }
    >
      <CardDescription>{CARD_MESSAGE}</CardDescription>
    </EuiCard>
  );
});
EndpointPolicyProtections.displayName = 'EndpointPolicyProtections';
