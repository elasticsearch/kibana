/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiFlyoutBody, EuiFlyoutHeader, useEuiTheme } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { DocumentToolsFlyoutHeader } from '../../../shared/components/document_tools_flyout_header';
import type { PrevalenceDetailsRow } from './utils/get_columns';
import { PrevalenceDetailsView } from './components/prevalence_details_view';

const TITLE = i18n.translate('xpack.securitySolution.flyout.prevalence.title', {
  defaultMessage: 'Prevalence',
});

export interface PrevalenceDetailsProps {
  /**
   * Alert/event document
   */
  hit: DataTableRecord;
  /**
   * List of investigation fields retrieved from the rule
   */
  investigationFields: string[];
  /**
   * Scope id, used for cell actions
   */
  scopeId: string;
  /**
   * Set of columns to render in the table
   */
  columns: Array<EuiBasicTableColumn<PrevalenceDetailsRow>>;
}

/**
 * Prevalence flyout — header + body shell wrapping PrevalenceDetailsView.
 */
export const PrevalenceDetails: React.FC<PrevalenceDetailsProps> = ({
  hit,
  investigationFields,
  scopeId,
  columns,
}) => {
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
        <PrevalenceDetailsView
          hit={hit}
          investigationFields={investigationFields}
          scopeId={scopeId}
          columns={columns}
        />
      </EuiFlyoutBody>
    </>
  );
};

PrevalenceDetails.displayName = 'PrevalenceDetails';
