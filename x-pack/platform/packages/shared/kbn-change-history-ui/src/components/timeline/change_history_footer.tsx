/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedDate, FormattedMessage, FormattedTime } from '@kbn/i18n-react';

export interface ChangeHistoryFooterProps {
  startedAt: Date;
}

export const ChangeHistoryFooter = memo(function ChangeHistoryFooter({
  startedAt,
}: ChangeHistoryFooterProps): JSX.Element {
  const { euiTheme } = useEuiTheme();

  return (
    <div
      css={css`
        padding: ${euiTheme.size.s} ${euiTheme.size.m};
      `}
      data-test-subj="changeHistoryFooter"
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="clock" size="s" color="subdued" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.changeHistoryUi.timeline.historyStartedOn"
              defaultMessage="On {date} History started"
              values={{
                date: (
                  <>
                    <FormattedDate value={startedAt} year="numeric" month="short" day="numeric" />
                    {' @ '}
                    <FormattedTime value={startedAt} hour="numeric" minute="2-digit" />
                  </>
                ),
              }}
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
});
