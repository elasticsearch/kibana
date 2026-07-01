/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPagination, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { buildDataTableRecord, type EsHitRecord } from '@kbn/discover-utils';
import { Timestamp } from '../../../../flyout_v2/shared/components/timestamp';
import { useDocumentDetailsContext } from '../../shared/context';
import { DocumentSeverity } from '../../../../flyout_v2/document/main/components/severity';
import { FlyoutTitle } from '../../../../flyout_v2/shared/components/flyout_title';
import { getDocumentTitle } from '../../../../flyout_v2/document/main/utils/get_header_title';
import { EVENT_TITLE_TEST_ID } from '../../../../flyout_v2/document/main/components/test_ids';
import { useFlyoutPagination } from '../../../../common/utils/flyout_pagination/use_flyout_pagination';
import { FLYOUT_ALERT_PAGINATION_TEST_ID } from './test_ids';

const PAGINATION_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.flyout.right.header.eventPaginationAriaLabel',
  {
    defaultMessage: 'Navigate between alerts',
  }
);

/**
 * Event details flyout right section header
 */
export const EventHeaderTitle = memo(() => {
  const { searchHit, paginationInstanceId } = useDocumentDetailsContext();
  const hit = useMemo(() => buildDataTableRecord(searchHit as EsHitRecord), [searchHit]);
  const title = useMemo(() => getDocumentTitle(hit), [hit]);

  const { flyoutAlertIndex, totalAlertCount, openAlertFlyout } =
    useFlyoutPagination(paginationInstanceId);
  // Show pagination only when this flyout was opened from a paginated source
  // (paginationInstanceId is set) and there is more than one document to navigate.
  // Rule preview is alerts-only and never reaches EventHeaderTitle, so there is
  // no isRulePreview carve-out here.
  const showPagination =
    paginationInstanceId != null &&
    totalAlertCount > 1 &&
    flyoutAlertIndex != null &&
    flyoutAlertIndex >= 0;

  return (
    <>
      <EuiFlexGroup
        gutterSize="s"
        justifyContent="spaceBetween"
        alignItems="center"
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <DocumentSeverity hit={hit} />
        </EuiFlexItem>
        {showPagination && (
          <EuiFlexItem grow={false}>
            <EuiPagination
              aria-label={PAGINATION_ARIA_LABEL}
              pageCount={totalAlertCount}
              activePage={flyoutAlertIndex}
              onPageClick={openAlertFlyout}
              compressed
              data-test-subj={FLYOUT_ALERT_PAGINATION_TEST_ID}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiText size="s">
        <Timestamp hit={hit} />
      </EuiText>
      <EuiSpacer size="xs" />
      <FlyoutTitle title={title} iconType={'analyzeEvent'} data-test-subj={EVENT_TITLE_TEST_ID} />
    </>
  );
});

EventHeaderTitle.displayName = 'EventHeaderTitle';
