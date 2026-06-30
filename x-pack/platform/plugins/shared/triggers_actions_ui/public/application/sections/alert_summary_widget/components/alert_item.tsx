/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type MouseEvent, type ReactNode } from 'react';
import numeral from '@elastic/numeral';
import {
  EuiIcon,
  EuiTitle,
  EuiText,
  EuiTextColor,
  EuiFlexItem,
  EuiLink,
  type EuiTextColorProps,
} from '@elastic/eui';
import { type PublicAlertStatus } from '@kbn/rule-data-utils';
import { ALERT_COUNT_FORMAT } from './constants';

interface AlertItemProps {
  label: string | ReactNode;
  count: number;
  color: EuiTextColorProps['color'];
  alertType?: PublicAlertStatus;
  handleClick?: (
    event: MouseEvent<HTMLAnchorElement | HTMLDivElement>,
    status?: PublicAlertStatus
  ) => void;
  showWarningIcon?: true;
  'data-test-subj'?: string;
}

export const AlertItem = ({
  label,
  count,
  handleClick,
  alertType,
  color,
  showWarningIcon,
  'data-test-subj': dataTestSubj,
}: AlertItemProps) => {
  const content = (
    <>
      <EuiTitle size="s">
        <EuiTextColor data-test-subj={dataTestSubj} color={color}>
          {numeral(count).format(ALERT_COUNT_FORMAT)}
          {count > 0 && showWarningIcon ? (
            <>
              &nbsp;
              <EuiIcon type="warning" ascent={10} aria-hidden={true} />
            </>
          ) : null}
        </EuiTextColor>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        {label}
      </EuiText>
    </>
  );

  return (
    <EuiFlexItem style={{ minWidth: 50, wordWrap: 'break-word' }} grow={false}>
      {handleClick ? (
        <EuiLink
          onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
            handleClick(event, alertType);
          }}
        >
          {content}
        </EuiLink>
      ) : (
        content
      )}
    </EuiFlexItem>
  );
};
