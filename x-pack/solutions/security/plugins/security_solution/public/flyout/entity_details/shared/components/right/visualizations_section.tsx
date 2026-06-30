/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { TableId } from '@kbn/securitysolution-data-table';
import { FLYOUT_STORAGE_KEYS } from '../../../../../flyout_v2/document/main/constants/local_storage';
import { useExpandSection } from '../../../../../flyout_v2/shared/hooks/use_expand_section';
import { ExpandableSection } from '../../../../../flyout_v2/shared/components/expandable_section';
import {
  VISUALIZATION_SECTION_TEST_ID,
  VISUALIZATION_SECTION_TITLE,
} from '../../../../../flyout_v2/document/main/components/visualizations_section';
import { useShouldShowGraph } from '../../../../shared/hooks/use_should_show_graph';
import { EntityDetailsLeftPanelTab, type EntityDetailsPath } from '../left_panel/left_panel_header';
import { EntityGraphPreviewContainer } from './entity_graph_preview_container';

const KEY = 'visualizations';

/**
 * Visualizations section in overview. It contains analyzer preview and session view preview.
 */
export const VisualizationsSection = memo(
  ({
    entityId,
    isPreviewMode,
    scopeId,
    openDetailsPanel,
  }: {
    entityId: string;
    isPreviewMode: boolean;
    scopeId: string;
    openDetailsPanel?: (path: EntityDetailsPath) => void;
  }) => {
    const expanded = useExpandSection({
      storageKey: FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS,
      title: KEY,
      defaultValue: false,
    });
    // Decide whether to show the graph preview or not
    const shouldShowGraph = useShouldShowGraph();
    const handleOpenGraphViewTab = useCallback(() => {
      openDetailsPanel?.({ tab: EntityDetailsLeftPanelTab.GRAPH_VIEW });
    }, [openDetailsPanel]);

    return (
      <>
        {shouldShowGraph && (
          <ExpandableSection
            expanded={expanded}
            title={VISUALIZATION_SECTION_TITLE}
            localStorageKey={FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS}
            sectionId={KEY}
            data-test-subj={VISUALIZATION_SECTION_TEST_ID}
          >
            <EntityGraphPreviewContainer
              entityId={entityId}
              // header link + arrow only shown when navigation is wired up (openDetailsPanel set)
              showIcon={!isPreviewMode && openDetailsPanel != null}
              disableNavigation={isPreviewMode || scopeId === TableId.rulePreview}
              onShowGraph={openDetailsPanel ? handleOpenGraphViewTab : undefined}
            />
          </ExpandableSection>
        )}
      </>
    );
  }
);

VisualizationsSection.displayName = 'VisualizationsSection';
