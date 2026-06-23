/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { isNonLocalIndexName } from '@kbn/es-query';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { FlyoutHeaderBlock } from '../../../shared/components/flyout_header_block';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { StatusPopoverButton } from './status_popover_button';
import { HEADER_STATUS_BLOCK_TEST_ID } from '../constants/test_ids';

const FIELD_WORKFLOW_STATUS = 'kibana.alert.workflow_status' as const;

export interface StatusProps {
  /**
   * The attack document. Workflow status and index name are read from here.
   */
  hit: DataTableRecord;
  /**
   * Called after a successful status change. Should trigger any necessary data refresh.
   */
  onAttackUpdated: () => void;
}

/**
 * Displays the workflow status of the attack and provides a popover to change it.
 */
export const Status = memo(({ hit, onAttackUpdated }: StatusProps) => {
  const workflowStatus = useMemo(() => getFieldValue(hit, FIELD_WORKFLOW_STATUS), [hit]);
  const isRemoteDocument = useMemo(
    () => isNonLocalIndexName(hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''),
    [hit]
  );

  return (
    <FlyoutHeaderBlock
      hasBorder
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.header.statusTitle"
          defaultMessage="Status"
        />
      }
      data-test-subj={HEADER_STATUS_BLOCK_TEST_ID}
    >
      {workflowStatus == null ? (
        getEmptyTagValue()
      ) : (
        <StatusPopoverButton
          hit={hit}
          disabled={isRemoteDocument}
          onAttackUpdated={onAttackUpdated}
        />
      )}
    </FlyoutHeaderBlock>
  );
});

Status.displayName = 'Status';
