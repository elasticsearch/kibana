/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiFlyoutBody, EuiFlyoutFooter, EuiFlyoutHeader, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';

const HEADER_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.flyoutV2.attack.header.placeholder',
  { defaultMessage: 'Attack details header' }
);

const BODY_PLACEHOLDER = i18n.translate('xpack.securitySolution.flyoutV2.attack.body.placeholder', {
  defaultMessage: 'Attack details body',
});

const FOOTER_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.flyoutV2.attack.footer.placeholder',
  { defaultMessage: 'Attack details footer' }
);

export interface AttackFlyoutProps {
  /**
   * The attack document to display.
   */
  hit: DataTableRecord;
  /**
   * Callback invoked after attack mutations (status change, assignee update, etc.) to refresh related views.
   */
  onAttackUpdated: () => void;
}

/**
 * Skeleton content for the attack flyout (v2). Header, body and footer will be
 * wired in subsequent PRs; for now each section renders a placeholder so the
 * flyout visually opens without errors.
 */
export const AttackFlyout = memo(
  ({ hit: _hit, onAttackUpdated: _onAttackUpdated }: AttackFlyoutProps) => {
    return (
      <>
        <EuiFlyoutHeader data-test-subj="attack-flyout-header">
          <EuiText>
            <p>{HEADER_PLACEHOLDER}</p>
          </EuiText>
        </EuiFlyoutHeader>
        <EuiFlyoutBody data-test-subj="attack-flyout-body">
          <EuiText>
            <p>{BODY_PLACEHOLDER}</p>
          </EuiText>
        </EuiFlyoutBody>
        <EuiFlyoutFooter data-test-subj="attack-flyout-footer">
          <EuiText>
            <p>{FOOTER_PLACEHOLDER}</p>
          </EuiText>
        </EuiFlyoutFooter>
      </>
    );
  }
);

AttackFlyout.displayName = 'AttackFlyout';
