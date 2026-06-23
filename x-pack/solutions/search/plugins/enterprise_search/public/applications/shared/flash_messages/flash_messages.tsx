/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { Fragment } from 'react';

import { useValues } from 'kea';

import { EuiCallOut, EuiSpacer } from '@elastic/eui';

import { FLASH_MESSAGE_TYPES } from './constants';
import { FlashMessagesLogic } from './flash_messages_logic';

export const FlashMessages: FC<PropsWithChildren<unknown>> = ({ children }) => {
  const { messages } = useValues(FlashMessagesLogic);

  return (
    <div aria-live="polite" data-test-subj="FlashMessages">
      {messages.map(({ type, message, description, iconType }, index) => (
        <Fragment key={index}>
          <EuiCallOut
            data-test-subj="flashMessageCallout"
            color={FLASH_MESSAGE_TYPES[type].color}
            iconType={iconType ?? FLASH_MESSAGE_TYPES[type].iconType}
            title={message}
          >
            {description}
          </EuiCallOut>
          <EuiSpacer />
        </Fragment>
      ))}
      {children}
    </div>
  );
};
