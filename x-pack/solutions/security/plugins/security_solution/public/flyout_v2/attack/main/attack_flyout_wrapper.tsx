/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { EuiCallOut } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { EsHitRecord } from '@kbn/discover-utils';
import { FlyoutLoading } from '../../shared/components/flyout_loading';
import { useAttackDetails } from '../../../flyout/attack_details/hooks/use_attack_details';
import { AttackFlyout } from '.';

const FETCH_ERROR = i18n.translate('xpack.securitySolution.flyoutV2.attack.wrapper.fetchError', {
  defaultMessage: 'Unable to fetch attack document.',
});

export interface AttackFlyoutWrapperProps {
  /**
   * The ID of the attack document to display.
   */
  attackId: string;
  /**
   * The name of the index that contains the attack document.
   */
  indexName: string;
  /**
   * Callback invoked after attack mutations to refresh related views (e.g. the
   * surface that opened the flyout). The wrapper additionally refetches the
   * attack document so the flyout itself reflects the mutation without the user
   * having to close and re-open it.
   */
  onAttackUpdated: () => void;
}

/**
 * Wrapper for AttackFlyout that owns the single fetch of the attack document
 * for the flyout. It builds the `hit` from the fetched search hit, and exposes
 * a refreshing `onAttackUpdated` callback to children so that any in-flyout
 * mutation (status, assignees, tags, ...) is reflected without re-opening
 * the flyout.
 */
export const AttackFlyoutWrapper = memo(
  ({ attackId, indexName, onAttackUpdated }: AttackFlyoutWrapperProps) => {
    const { loading, searchHit, refetch } = useAttackDetails({ attackId, indexName });

    const hit = useMemo(
      () => (searchHit ? buildDataTableRecord(searchHit as EsHitRecord) : null),
      [searchHit]
    );

    const handleAttackUpdated = useCallback(() => {
      onAttackUpdated();
      refetch();
    }, [onAttackUpdated, refetch]);

    // Only render the full-flyout loading state on the initial fetch (no hit yet).
    // Subsequent refetches (e.g. after a mutation) keep the flyout visible so the
    // header does not flicker; child components can render their own loading state
    // if needed.
    if (loading && !hit) {
      return <FlyoutLoading data-test-subj="attack-flyout-wrapper-loading" />;
    }

    if (!hit) {
      return (
        <EuiCallOut
          announceOnMount
          color="danger"
          iconType="warning"
          title={FETCH_ERROR}
          data-test-subj="attack-flyout-wrapper-error"
        />
      );
    }

    return <AttackFlyout hit={hit} onAttackUpdated={handleAttackUpdated} />;
  }
);

AttackFlyoutWrapper.displayName = 'AttackFlyoutWrapper';
