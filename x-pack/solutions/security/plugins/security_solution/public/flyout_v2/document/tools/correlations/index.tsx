/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { css } from '@emotion/react';
import { EuiFlyoutBody, EuiFlyoutHeader, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { DocumentToolsFlyoutHeader } from '../../../shared/components/document_tools_flyout_header';
import { CorrelationsDetailsView } from './components/correlations_details_view';

const TITLE = i18n.translate('xpack.securitySolution.flyout.correlations.title', {
  defaultMessage: 'Correlations',
});

export interface CorrelationsDetailsProps {
  /**
   * Alert/event document
   */
  hit: DataTableRecord;
  /**
   * Scope ID for the document
   */
  scopeId: string;
  /**
   * Whether the document is being displayed in a rule preview
   */
  isRulePreview: boolean;
  /**
   * Callback to open an alert preview when clicking the preview button in the correlations table
   */
  onShowAlert: (id: string, indexName: string) => void;
  /**
   * Callback to open an attack preview when clicking the expand button in the related attacks table.
   * When not provided, the expand button column is hidden.
   * // TODO make required once we have an attack flyout in the new flyout system
   */
  onShowAttack?: (id: string, indexName: string) => void;
}

/**
 * Displays the full correlations details for a given alert/event document.
 * This component is meant to be used in a tools flyout, with the new EUI flyout system.
 */
export const CorrelationsDetails = memo(
  ({ hit, scopeId, isRulePreview, onShowAlert, onShowAttack }: CorrelationsDetailsProps) => {
    const { euiTheme } = useEuiTheme();

    return (
      <>
        <EuiFlyoutHeader
          hasBorder
          css={css`
            padding-block: ${euiTheme.size.s} !important;
          `}
        >
          <DocumentToolsFlyoutHeader title={TITLE} hit={hit} />
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <CorrelationsDetailsView
            hit={hit}
            scopeId={scopeId}
            isRulePreview={isRulePreview}
            onShowAlert={onShowAlert}
            onShowAttack={onShowAttack}
            useLegacyExpandableFlyout={false}
          />
        </EuiFlyoutBody>
      </>
    );
  }
);

CorrelationsDetails.displayName = 'CorrelationsDetails';
