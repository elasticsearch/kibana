/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { buildDataTableRecord, type EsHitRecord } from '@kbn/discover-utils';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { getRawData } from '../../assistant/helpers';
import { AIAssistantSection } from './components/ai_assistant_section';
import { AttackDiscoverySection } from './components/attack_discovery_section';
import { DocumentSummarySection } from '../../flyout_v2/document/main/components/document_summary_section';
import { HighlightedFields } from '../../flyout_v2/document/main/components/highlighted_fields';
import { noopCellActionRenderer } from '../../flyout_v2/shared/components/cell_actions';
import { useEaseDetailsContext } from './context';
import { FlyoutBody } from '../shared/components/flyout_body';
import { FlyoutNavigation } from '../shared/components/flyout_navigation';
import type { EaseDetailsProps } from './types';
import { PanelFooter } from './footer';
import { FlyoutHeader } from '../shared/components/flyout_header';
import { HeaderTitle } from './components/header_title';

export const FLYOUT_BODY_TEST_ID = 'ease-alert-flyout-body';
export const ATTACK_DISCOVERY_SECTION_TEST_ID = 'ease-alert-flyout-attack-discovery-section';
export const DOCUMENT_SUMMARY_SECTION_TEST_ID = 'ease-alert-flyout-document-summary-section';

/**
 * Panel to be displayed in EASE alert summary flyout
 */
export const EasePanel: React.FC<Partial<EaseDetailsProps>> = memo(() => {
  const { eventId, dataFormattedForFieldBrowser, investigationFields, searchHit } =
    useEaseDetailsContext();
  const hit = useMemo(() => buildDataTableRecord(searchHit as EsHitRecord), [searchHit]);

  const getPromptContext = useCallback(
    async () => getRawData(dataFormattedForFieldBrowser),
    [dataFormattedForFieldBrowser]
  );

  return (
    <>
      <FlyoutNavigation flyoutIsExpandable={false} />
      <FlyoutHeader>
        <HeaderTitle />
      </FlyoutHeader>
      <FlyoutBody data-test-subj={FLYOUT_BODY_TEST_ID}>
        <EuiFlexGroup direction="column">
          <EuiFlexItem>
            <DocumentSummarySection
              documentId={eventId}
              getPromptContext={getPromptContext}
              data-test-subj={DOCUMENT_SUMMARY_SECTION_TEST_ID}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <HighlightedFields
              hideEditButton={true}
              hit={hit}
              investigationFields={investigationFields}
              renderCellActions={noopCellActionRenderer}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <AttackDiscoverySection />
          </EuiFlexItem>
          <EuiFlexItem>
            <AIAssistantSection getPromptContext={getPromptContext} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </FlyoutBody>
      <PanelFooter />
    </>
  );
});

EasePanel.displayName = 'EasePanel';
