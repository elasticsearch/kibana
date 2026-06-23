/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useWatch } from 'react-hook-form';
import { EuiBadge, EuiButton, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { CustomRecoveryRenderProps } from '../types';
import type { ComposeFormValues } from '../compose_form_types';
import { QuerySummary } from '../query_summary';

export const EsqlRecoveryContent: React.FC<CustomRecoveryRenderProps> = ({ state, dispatch }) => {
  const query = useWatch<ComposeFormValues, 'query'>({ name: 'query' });
  const baseQuery = query?.format === 'composed' ? query.base : '';
  const recoveryBlock = query?.format === 'composed' ? query.recovery?.segment ?? '' : '';
  const hasValidRecoveryBlock = Boolean(recoveryBlock.trim());

  return (
    <>
      <EuiText size="xs" color="subdued">
        <strong>
          <FormattedMessage
            id="xpack.alertingV2.composeDiscover.recoveryCondition.baseQueryLabel"
            defaultMessage="Base query"
          />
        </strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <QuerySummary
        query={baseQuery}
        emptyMessage={i18n.translate(
          'xpack.alertingV2.composeDiscover.recoveryCondition.noBaseQueryDefined',
          { defaultMessage: 'No base query defined' }
        )}
      />
      <EuiSpacer size="m" />
      <EuiText size="xs" color="subdued">
        <strong>
          <FormattedMessage
            id="xpack.alertingV2.composeDiscover.recoveryCondition.recoveryConditionLabel"
            defaultMessage="Recovery condition"
          />
        </strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <QuerySummary
        query={recoveryBlock}
        emptyMessage={i18n.translate(
          'xpack.alertingV2.composeDiscover.recoveryCondition.noRecoveryConditionDefined',
          { defaultMessage: 'No recovery condition defined' }
        )}
      />
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="editorCodeBlock"
            isDisabled={state.childOpen}
            onClick={() =>
              dispatch({ type: 'OPEN_CHILD_FOR_STEP', step: state.step, isAlert: true })
            }
            data-test-subj="composeDiscoverEditRecovery"
          >
            <FormattedMessage
              id="xpack.alertingV2.composeDiscover.recoveryCondition.editRecoveryButtonLabel"
              defaultMessage="Edit recovery query"
            />
          </EuiButton>
        </EuiFlexItem>
        {hasValidRecoveryBlock && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="success">
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.recoveryCondition.customConditionSetBadgeLabel"
                defaultMessage="Custom condition set"
              />
            </EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  );
};
