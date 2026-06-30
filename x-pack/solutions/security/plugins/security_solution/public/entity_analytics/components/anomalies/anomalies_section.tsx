/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  useEuiTheme,
  useEuiFontSize,
  EuiAccordion,
  EuiTitle,
  EuiSpacer,
  EuiHorizontalRule,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';
import {
  ENTITY_ANOMALIES_SECTION_TITLE,
  ENTITY_ANOMALIES_OVERVIEW_TIMEFRAME,
} from './translations';
import type { GetAnomalyOverviewResponse } from '../../../../common/api/entity_analytics';
import type { EntityDetailsPath } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import { AnomaliesOverview } from './anomalies_overview';

interface AnomaliesSectionProps {
  data: GetAnomalyOverviewResponse;
  entityId: string;
  isPreviewMode?: boolean;
  openDetailsPanel: (path: EntityDetailsPath) => void;
}

export const AnomaliesSection: React.FC<AnomaliesSectionProps> = (props) => {
  const { euiTheme } = useEuiTheme();
  const xsFontSize = useEuiFontSize('xs').fontSize;

  if (props.data.totalAnomaliesCount === 0) {
    return null;
  }

  return (
    <>
      <EuiAccordion
        id="entity-anomalies-flyout-section"
        initialIsOpen
        data-test-subj="entity-anomalies-flyout-section-data-test-subj"
        buttonProps={{
          'data-test-subj': 'entity-anomalies-flyout-section-accordion-button',
          css: css`
            color: ${euiTheme.colors.primary};
          `,
        }}
        buttonContent={
          <EuiTitle size="xs">
            <h3>{ENTITY_ANOMALIES_SECTION_TITLE}</h3>
          </EuiTitle>
        }
        extraAction={
          <span
            data-test-subj="entity-anomalies-flyout-section-accordion-timeframe"
            css={css`
              font-size: ${xsFontSize};
              color: ${euiTheme.colors.textSubdued};
            `}
          >
            {ENTITY_ANOMALIES_OVERVIEW_TIMEFRAME}
          </span>
        }
      >
        <EuiSpacer size="m" />
        <AnomaliesOverview {...props} />
      </EuiAccordion>
      <EuiHorizontalRule />
    </>
  );
};
