/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { memo, useMemo } from 'react';
import { EuiBadge } from '@elastic/eui';
import { getActionStatus } from './hooks';
import type { ResponseActionStatus } from '../../../../../common/endpoint/service/response_actions/constants';

export const ResponseActionStatusBadge = memo(
  ({
    status,
    'data-test-subj': dataTestSubj,
    tabIndex,
  }: {
    status: ResponseActionStatus;
    'data-test-subj'?: string;
    tabIndex?: number;
  }) => {
    const displayValue = useMemo(() => getActionStatus(status), [status]);
    const color = useMemo(() => {
      switch (status) {
        case 'successful':
          return 'success';
        case 'failed':
          return 'danger';
        case 'canceled':
          return 'default';
        default:
          return 'warning';
      }
    }, [status]);

    return (
      // We've a EuiTooltip that wraps this component,
      // Thus we don't need to add a title tooltip as well.
      <EuiBadge data-test-subj={dataTestSubj} color={color} title="" tabIndex={tabIndex}>
        {displayValue}
      </EuiBadge>
    );
  }
);

ResponseActionStatusBadge.displayName = 'ResponseActionStatusBadge';
