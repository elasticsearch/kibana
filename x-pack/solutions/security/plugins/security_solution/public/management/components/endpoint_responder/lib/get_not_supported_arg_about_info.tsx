/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIcon, EuiText } from '@elastic/eui';

/**
 * Wraps some content (ex. Command argument's about info) with a notice that is prefixed with an icon.
 * Primary reason to use this function is to be abel to return JSX to be used in the
 * `console_commands_definition` file which is a `.ts` file
 * @param content
 * @param noticeMessage
 */
export const wrapWithNotice = (
  content: React.ReactNode,
  noticeMessage: string
): React.ReactNode => {
  return (
    <>
      {content}
      <EuiText size="s">
        <EuiIcon type="warning" size="s" color="warning" aria-hidden={true} /> {noticeMessage}
      </EuiText>
    </>
  );
};
