/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { EuiIcon, EuiLoadingSpinner, EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import useObservable from 'react-use/lib/useObservable';
import { type DocCountResult, type docCountApi, RequestResultType } from './get_doc_count';
import { isClosedIndexStatus } from '../../../../lib/is_closed_index_status';
import { docCountApproximateTooltip, docCountClosedIndexTooltip } from '../translations';
interface DocCountCellProps {
  indexName: string;
  docCountApi: ReturnType<typeof docCountApi>;
  // Metadata based doc count already fetched as part of the index list (available even without read access).
  metadataCount?: number;
  // Closed indices prevent ES|QL from running at all.
  status?: string;
}

export const DocCountCell = ({
  indexName,
  docCountApi,
  metadataCount,
  status,
}: DocCountCellProps) => {
  const isClosed = isClosedIndexStatus(status);
  const isWaitingForIndexStats = status === undefined && metadataCount === undefined;

  const docCountResponse = useObservable<Record<string, DocCountResult>>(
    docCountApi.getObservable()
  );
  const result = docCountResponse ? docCountResponse[indexName] : undefined;

  useEffect(() => {
    // Don't request an ES|QL count for closed indices, ES|QL cant read them and would
    // poison the whole batch they share.
    if (!isClosed && !isWaitingForIndexStats) {
      docCountApi.getByName(indexName);
    }
  }, [docCountApi, indexName, isClosed, isWaitingForIndexStats]);

  // Closed index: skip ES|QL entirely, show metadata count with a tooltip.
  if (isClosed) {
    if (metadataCount !== undefined) {
      return (
        <EuiToolTip content={docCountClosedIndexTooltip}>
          <span style={{ cursor: 'default' }}>
            {Number(metadataCount).toLocaleString()}&nbsp;
            <EuiIcon type="info" size="s" color="subdued" aria-label={docCountClosedIndexTooltip} />
          </span>
        </EuiToolTip>
      );
    }
    return null;
  }

  if (result === undefined) {
    return <EuiLoadingSpinner size="m" data-test-subj="docCountLoadingSpinner" />;
  }

  if (result.status === RequestResultType.Error) {
    // Fall back to metadata count (e.g. no read privilege) rather than showing "Error".
    if (metadataCount !== undefined) {
      return (
        <EuiToolTip content={docCountApproximateTooltip}>
          <span style={{ cursor: 'default' }}>
            {Number(metadataCount).toLocaleString()}&nbsp;
            <EuiIcon type="info" size="s" color="subdued" aria-label={docCountApproximateTooltip} />
          </span>
        </EuiToolTip>
      );
    }

    // No metadata count available, last resort is the original error display.
    return (
      <EuiToolTip
        content={i18n.translate('xpack.idxMgmt.indexTable.docCountErrorTooltip', {
          defaultMessage: 'Error loading document count',
        })}
      >
        <EuiText size="s" color="danger" tabIndex={0}>
          {i18n.translate('xpack.idxMgmt.indexTable.docCountErrorLabel', {
            defaultMessage: 'Error',
          })}
        </EuiText>
      </EuiToolTip>
    );
  }

  return Number(result.count).toLocaleString();
};
