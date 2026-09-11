/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import type { Query } from '@kbn/es-query';
import React, { useCallback, useEffect, useState } from 'react';
import type { ActionButton, InlineRenderCallbacks } from '@kbn/agent-builder-browser/attachments';
import type {
  StatefulSearchBarProps,
  UnifiedSearchPublicPluginStart,
} from '@kbn/unified-search-plugin/public';
import { DEFAULT_VISUALIZATION_HEIGHT } from './get_visualization_dimensions';
import {
  visualizationEmbeddableStyles,
  visualizationHeaderStyles,
  visualizationTimePickerContainerClassName,
  visualizationWrapperStyles,
} from './styles';
import { FallbackVisualizationActions } from './visualization_actions';

export interface VisualizationPreviewShellProps {
  unifiedSearch: UnifiedSearchPublicPluginStart;
  searchBarProps: StatefulSearchBarProps<Query>;
  actionButtons: ActionButton[];
  registerActionButtons?: InlineRenderCallbacks['registerActionButtons'];
  height?: number;
  dataTestSubj?: string;
  children: React.ReactNode;
}

/** Shared time-picker chrome and action-button registration for inline visualizations. */
export function VisualizationPreviewShell({
  unifiedSearch,
  searchBarProps,
  actionButtons,
  registerActionButtons,
  height = DEFAULT_VISUALIZATION_HEIGHT,
  dataTestSubj,
  children,
}: VisualizationPreviewShellProps) {
  const SearchBar = unifiedSearch.ui.SearchBar;
  const [localActionButtons, setLocalActionButtons] = useState<ActionButton[]>([]);
  const registerLocalActionButtons = useCallback((buttons: ActionButton[]) => {
    setLocalActionButtons(buttons);
  }, []);
  const register = registerActionButtons ?? registerLocalActionButtons;
  const shouldRenderLocalActionButtons = !registerActionButtons && localActionButtons.length > 0;

  useEffect(() => {
    register(actionButtons);
    return () => register([]);
  }, [actionButtons, register]);

  return (
    <div data-test-subj={dataTestSubj} css={visualizationWrapperStyles}>
      {shouldRenderLocalActionButtons && (
        <FallbackVisualizationActions buttons={localActionButtons} />
      )}
      <div css={visualizationHeaderStyles} className={visualizationTimePickerContainerClassName}>
        <SearchBar {...searchBarProps} />
      </div>
      <div css={[visualizationEmbeddableStyles(height), css({ width: '100%' })]}>{children}</div>
    </div>
  );
}
