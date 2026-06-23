/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { EuiBadge, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { FlyoutTitle } from '../../../shared/components/flyout_title';
import { Timestamp } from '../../../shared/components/timestamp';
import { HEADER_BADGE_TEST_ID, HEADER_TITLE_TEST_ID } from '../constants/test_ids';

const ATTACK_HEADER_BADGE = i18n.translate(
  'xpack.securitySolution.flyoutV2.attack.header.badge.attackLabel',
  { defaultMessage: 'Attack' }
);

const FIELD_ATTACK_TITLE = 'kibana.alert.attack_discovery.title' as const;

export interface HeaderTitleProps {
  /**
   * The attack document to display.
   */
  hit: DataTableRecord;
}

/**
 * Renders the timestamp, attack title, and the "Attack" badge in the flyout header.
 */
export const HeaderTitle = memo(({ hit }: HeaderTitleProps) => {
  const title = useMemo(() => (getFieldValue(hit, FIELD_ATTACK_TITLE) as string) ?? '', [hit]);

  return (
    <>
      <Timestamp hit={hit}>
        <EuiSpacer size="xs" />
      </Timestamp>
      <FlyoutTitle data-test-subj={HEADER_TITLE_TEST_ID} title={title} iconType="bolt" />
      <EuiSpacer size="s" />
      <EuiBadge
        aria-label={ATTACK_HEADER_BADGE}
        color="hollow"
        data-test-subj={HEADER_BADGE_TEST_ID}
        tabIndex={0}
      >
        {ATTACK_HEADER_BADGE}
      </EuiBadge>
    </>
  );
});

HeaderTitle.displayName = 'HeaderTitle';
