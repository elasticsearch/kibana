/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { css } from '@emotion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import type { ApplicationStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { TimeRange } from '@kbn/es-query';
import { SEARCH_EMBEDDABLE_TYPE } from '@kbn/discover-utils';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import {
  ActionButtonType,
  type ActionButton,
  type InlineRenderCallbacks,
} from '@kbn/agent-builder-browser/attachments';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import {
  SavedObjectSaveModalDashboard,
  type SaveModalDashboardProps,
} from '@kbn/presentation-util-plugin/public';
import { toSearchEmbeddableByValueState } from '../../common/agent_builder/to_search_embeddable_by_value_state';
import type { DiscoverAppLocator } from '../../common';
import type { DiscoverSessionApiData } from '../../server';
import type { SearchEmbeddableApi, SearchEmbeddablePanelApiState } from '../embeddable/types';
import { SearchEmbeddableToolbarProvider } from '../embeddable/components/search_embeddable_toolbar_context';
import {
  buildDiscoverSessionDashboardSaveState,
  buildDiscoverSessionEmbeddableInput,
  getDiscoverSessionLocatorParams,
  getDiscoverSessionSeedTimeRange,
  isDiscoverSessionByValueState,
} from './discover_session_inline_state';
import { useDiscoverSessionUnifiedSearch } from './use_discover_session_unified_search';

const INLINE_TABLE_HEIGHT = 400;

const sessionTimePickerStyles = css({
  width: 'max-content',
  maxWidth: '100%',
});

const saveTableToDashboardButtonLabel = i18n.translate(
  'discover.agentBuilder.saveTableToDashboardButtonLabel',
  {
    defaultMessage: 'Save table to dashboard',
  }
);

const dashboardWriteControlsDisabledReason = i18n.translate(
  'discover.agentBuilder.dashboardWriteControlsDisabledReason',
  {
    defaultMessage: 'You need dashboard write permissions to save tables to a dashboard.',
  }
);

const saveModalObjectType = i18n.translate('discover.agentBuilder.saveToDashboardObjectType', {
  defaultMessage: 'Discover session',
});

export interface DiscoverSessionInlineProps {
  data: DiscoverSessionApiData;
  screenContextTimeRange?: TimeRange;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  locator?: DiscoverAppLocator;
  embeddable?: EmbeddableStart;
  application?: ApplicationStart;
  registerActionButtons?: InlineRenderCallbacks['registerActionButtons'];
}

export const DiscoverSessionInline = ({
  data,
  screenContextTimeRange,
  unifiedSearch,
  locator,
  embeddable,
  application,
  registerActionButtons,
}: DiscoverSessionInlineProps) => {
  const SearchBar = unifiedSearch.ui.SearchBar;
  const [embeddableApi, setEmbeddableApi] = useState<SearchEmbeddableApi | undefined>();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const visibleColumnsRef = useRef<string[] | undefined>(undefined);
  const canWriteDashboards = application?.capabilities.dashboard_v2?.showWriteControls === true;

  const mappedState = useMemo(() => toSearchEmbeddableByValueState(data), [data]);
  const seedTimeRange = getDiscoverSessionSeedTimeRange({
    mappedTimeRange: mappedState.time_range,
    screenContextTimeRange,
  });
  const { searchBarProps, effectiveTimeRange } = useDiscoverSessionUnifiedSearch({
    timeRange: seedTimeRange,
  });

  const serializedState = useMemo(
    () => buildDiscoverSessionEmbeddableInput(data, effectiveTimeRange),
    [data, effectiveTimeRange]
  );

  const parentApi = useMemo(
    () => ({
      getSerializedStateForChild: () => serializedState,
    }),
    [serializedState]
  );

  const toolbarLeftSide = useMemo(
    () => (
      <div css={sessionTimePickerStyles} data-test-subj="discoverAgentBuilderSessionTimePicker">
        <SearchBar {...searchBarProps} />
      </div>
    ),
    [SearchBar, searchBarProps]
  );

  const onVisibleColumnsChange = useCallback((columns: string[]) => {
    visibleColumnsRef.current = columns;
  }, []);

  useEffect(() => {
    embeddableApi?.setTimeRange(effectiveTimeRange);
  }, [embeddableApi, effectiveTimeRange]);

  const openSaveModal = useCallback(() => {
    if (canWriteDashboards) {
      setIsSaveModalOpen(true);
    }
  }, [canWriteDashboards]);

  const saveToDashboardButton = useMemo(() => {
    if (!embeddable || !application || !embeddableApi) {
      return undefined;
    }

    return (
      <EuiToolTip
        content={
          canWriteDashboards
            ? saveTableToDashboardButtonLabel
            : dashboardWriteControlsDisabledReason
        }
        disableScreenReaderOutput
        position="top"
      >
        <EuiButtonIcon
          data-test-subj="saveDiscoverTableToDashboardButton"
          aria-label={saveTableToDashboardButtonLabel}
          color="text"
          size="s"
          iconSize="m"
          iconType="addToDashboard"
          isDisabled={!canWriteDashboards}
          onClick={openSaveModal}
        />
      </EuiToolTip>
    );
  }, [application, canWriteDashboards, embeddable, embeddableApi, openSaveModal]);

  const toolbarSlot = useMemo(
    () => ({
      leftSide: toolbarLeftSide,
      saveToDashboardButton,
      onVisibleColumnsChange,
    }),
    [onVisibleColumnsChange, saveToDashboardButton, toolbarLeftSide]
  );

  const closeSaveModal = useCallback(() => setIsSaveModalOpen(false), []);

  const onSaveToDashboard = useCallback<SaveModalDashboardProps['onSave']>(
    async ({ dashboardId, newTitle, newDescription }) => {
      if (!embeddable || !embeddableApi) {
        return;
      }

      const liveState = embeddableApi.getSerializedStateByValue();
      if (!isDiscoverSessionByValueState(liveState)) {
        return;
      }

      setIsSaveModalOpen(false);

      const dashboardSerializedState = buildDiscoverSessionDashboardSaveState({
        liveState,
        visibleColumns: visibleColumnsRef.current,
        title: newTitle,
        description: newDescription,
      });

      await embeddable.getStateTransfer().navigateToWithEmbeddablePackages('dashboards', {
        state: [{ type: SEARCH_EMBEDDABLE_TYPE, serializedState: dashboardSerializedState }],
        path: dashboardId && dashboardId !== 'new' ? `#/view/${dashboardId}` : '#/create',
      });
    },
    [embeddable, embeddableApi]
  );

  useEffect(() => {
    if (!registerActionButtons) {
      return;
    }

    const buttons: ActionButton[] = [];

    if (locator) {
      buttons.push({
        type: ActionButtonType.SECONDARY,
        icon: 'discoverApp',
        label: i18n.translate('discover.agentBuilder.openInDiscoverButtonLabel', {
          defaultMessage: 'Open in Discover',
        }),
        handler: () => {
          void locator.navigate(
            getDiscoverSessionLocatorParams({ data, timeRange: effectiveTimeRange })
          );
        },
      });
    }

    registerActionButtons(buttons);
    return () => registerActionButtons([]);
  }, [data, effectiveTimeRange, locator, registerActionButtons]);

  return (
    <SearchEmbeddableToolbarProvider value={toolbarSlot}>
      <div
        css={css`
          height: ${INLINE_TABLE_HEIGHT}px;
          overflow: hidden;
        `}
      >
        <EmbeddableRenderer<SearchEmbeddablePanelApiState, SearchEmbeddableApi>
          maybeId={undefined}
          type={SEARCH_EMBEDDABLE_TYPE}
          getParentApi={() => parentApi}
          onApiAvailable={setEmbeddableApi}
          hidePanelChrome
        />
      </div>
      {isSaveModalOpen && (
        <SavedObjectSaveModalDashboard
          objectType={saveModalObjectType}
          documentInfo={{ title: data.title ?? '' }}
          canSaveByReference={false}
          onClose={closeSaveModal}
          onSave={onSaveToDashboard}
        />
      )}
    </SearchEmbeddableToolbarProvider>
  );
};
