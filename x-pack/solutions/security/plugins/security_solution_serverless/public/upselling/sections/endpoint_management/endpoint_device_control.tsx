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
  'xpack.securitySolutionServerless.endpointDeviceControl.cardTitle',
  {
    defaultMessage: 'Device Control',
  }
);
const CARD_MESSAGE = i18n.translate(
  'xpack.securitySolutionServerless.endpointDeviceControl.cardMessage',
  {
    defaultMessage:
      'To turn on Device Control, you must add at least Endpoint Complete to your project. ',
  }
);
const BADGE_TEXT = i18n.translate(
  'xpack.securitySolutionServerless.endpointDeviceControl.badgeText',
  {
    defaultMessage: 'Endpoint Complete',
  }
);

const CardDescription = styled.p`
  padding: 0 33.3%;
`;

export const EndpointDeviceControl = memo(() => {
  return (
    <EuiCard
      data-test-subj="endpointDeviceControlLockedCard"
      isDisabled={true}
      description={false}
      icon={<EuiIcon size="xl" type="lock" aria-hidden={true} />}
      betaBadgeProps={{
        'data-test-subj': 'endpointDeviceControlLockedCard-badge',
        label: BADGE_TEXT,
      }}
      title={
        <h3 data-test-subj="endpointDeviceControlLockedCard-title">
          <strong>{CARD_TITLE}</strong>
        </h3>
      }
    >
      <CardDescription>{CARD_MESSAGE}</CardDescription>
    </EuiCard>
  );
});
EndpointDeviceControl.displayName = 'EndpointDeviceControl';
