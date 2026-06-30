/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { unit } from '../../../../../utils/style';
import { PopoverTooltip } from '../../../popover_tooltip';
import { TruncateWithTooltip } from '../../../truncate_with_tooltip';
import type { APMLinkExtendProps } from '../apm_link_hooks';
import { MaxGroupsMessage } from '../max_groups_message';

export const txGroupsDroppedBucketName = '_other';

interface Props extends APMLinkExtendProps {
  transactionName: string;
  href: string;
}

export function TransactionDetailLink({ transactionName, href, ...rest }: Props) {
  if (transactionName !== txGroupsDroppedBucketName) {
    return (
      <TruncateWithTooltip
        text={transactionName}
        content={<EuiLink data-test-subj="apmTransactionDetailLinkLink" href={href} {...rest} />}
      />
    );
  }

  return (
    <EuiFlexGroup alignItems="center" gutterSize="xs">
      <EuiFlexItem grow={false} style={{ fontStyle: 'italic' }}>
        {i18n.translate('xpack.apm.transactionDetail.remainingServices', {
          defaultMessage: 'Remaining Transactions',
        })}
      </EuiFlexItem>
      <EuiFlexItem>
        <PopoverTooltip
          ariaLabel={i18n.translate('xpack.apm.transactionDetail.tooltip', {
            defaultMessage:
              'Number of services instrumented has reached the current capacity of the APM server',
          })}
          iconType="warning"
        >
          <EuiText style={{ width: `${unit * 28}px` }} size="s">
            <MaxGroupsMessage />
          </EuiText>
        </PopoverTooltip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
