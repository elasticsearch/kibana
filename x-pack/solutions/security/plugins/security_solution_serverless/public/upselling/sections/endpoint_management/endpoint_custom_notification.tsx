/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiCard, EuiIcon, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';

const CARD_TITLE = i18n.translate(
  'xpack.securitySolutionServerless.endpointCustomNotification.cardTitle',
  {
    defaultMessage: 'Custom notification',
  }
);
const CARD_MESSAGE = i18n.translate(
  'xpack.securitySolutionServerless.endpointCustomNotification.cardMessage',
  {
    defaultMessage:
      'To customize the user notification, you must add Endpoint Protection Complete to your project.',
  }
);
const BADGE_TEXT = i18n.translate(
  'xpack.securitySolutionServerless.endpointCustomNotification.badgeText',
  {
    defaultMessage: 'Endpoint Complete',
  }
);

const CardDescription = styled.p`
  padding: 0 33.3%;
`;

/**
 * Component displayed when a given product tier is not allowed to use endpoint policy protections.
 */
export const EndpointCustomNotification = memo(() => {
  return (
    <>
      <EuiSpacer size="s" />
      <EuiCard
        data-test-subj="endpointPolicy-customNotificationLockedCard"
        isDisabled={true}
        description={false}
        icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
        betaBadgeProps={{
          'data-test-subj': 'endpointPolicy-customNotificationLockedCard-badge',
          label: BADGE_TEXT,
        }}
        title={
          <h3 data-test-subj="endpointPolicy-customNotificationLockedCard-title">
            <strong>{CARD_TITLE}</strong>
          </h3>
        }
      >
        <CardDescription>{CARD_MESSAGE}</CardDescription>
      </EuiCard>
    </>
  );
});
EndpointCustomNotification.displayName = 'EndpointCustomNotification';
