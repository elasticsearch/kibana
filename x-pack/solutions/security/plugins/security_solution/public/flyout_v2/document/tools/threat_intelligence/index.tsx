/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React, { memo } from 'react';
import { EuiFlyoutBody, EuiFlyoutHeader, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { DocumentToolsFlyoutHeader } from '../../../shared/components/document_tools_flyout_header';
import { ThreatIntelligenceDetailsView } from './components/threat_intelligence_details_view';

export const THREAT_INTELLIGENCE_TAB_ID = 'threatIntelligence';

const TITLE = i18n.translate('xpack.securitySolution.flyout.threatIntelligence.title', {
  defaultMessage: 'Threat intelligence',
});

export interface ThreatIntelligenceDetailsProps {
  /**
   * The document hit to display threat intelligence for
   */
  hit: DataTableRecord;
}

/**
 * Threat intelligence flyout — header + body shell wrapping ThreatIntelligenceDetailsView.
 */
export const ThreatIntelligenceDetails = memo(({ hit }: ThreatIntelligenceDetailsProps) => {
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
        <ThreatIntelligenceDetailsView hit={hit} />
      </EuiFlyoutBody>
    </>
  );
});

ThreatIntelligenceDetails.displayName = 'ThreatIntelligenceDetails';
