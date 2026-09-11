/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps, ComponentRef, RefAttributes } from 'react';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from 'react';
import type { EuiTabbedContentTab } from '@elastic/eui';
import { EuiTabbedContent } from '@elastic/eui';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import type { AnalyticsServiceStart } from '@kbn/core/public';
import { getDocViewTabEbtProps } from './get_doc_view_tab_ebt_props';
import { DocViewerTab } from './doc_viewer_tab';
import type { DocView, DocViewRenderProps, DocViewerShareableState } from '../../types';
import { useDocViewerTabViewedEvent } from '../../analytics';
import {
  useRestorableState,
  useRestorableStateValue,
  withRestorableState,
} from './restorable_state';
import { capShareableState, projectShareableTabsState } from './shareable_state';

export const INITIAL_TAB = 'unifiedDocViewer:initialTab';

export interface InternalDocViewerApi {
  setSelectedTabId: (tabId: string) => void;
}

export interface InternalDocViewerProps
  extends DocViewRenderProps,
    RefAttributes<InternalDocViewerApi>,
    Pick<AnalyticsServiceStart, 'reportEvent'> {
  docViews: DocView[];
  initialTabId?: DocView['id'];
  onUpdateSelectedTabId?: (tabId: string | undefined) => void;
  /**
   * Emits the URL-shareable projection of the doc viewer state (selected tab + per-tab shareable
   * slices) whenever it changes, so a host can persist it in a deep link.
   */
  onShareableStateChange?: (state: DocViewerShareableState) => void;
  originDocType?: string;
}

const getFullTabId = (tabId: string) => `kbn_doc_viewer_tab_${tabId}`;
const getOriginalTabId = (fullTabId: string) => fullTabId.replace('kbn_doc_viewer_tab_', '');

const InternalDocViewer = forwardRef<InternalDocViewerApi, InternalDocViewerProps>(
  (
    {
      docViews,
      initialTabId,
      onUpdateSelectedTabId,
      onShareableStateChange,
      reportEvent,
      originDocType,
      ...renderProps
    },
    ref
  ) => {
    const tabs = docViews
      .filter(({ enabled }) => enabled) // Filter out disabled doc views
      .map((docView: DocView) => ({
        id: getFullTabId(docView.id), // `id` value is used to persist the selected tab in localStorage
        name: docView.title,
        prepend: docView.prepend,
        content: (
          <DocViewerTab
            key={`${renderProps.hit.id}_${docView.id}`}
            docView={docView}
            renderProps={renderProps}
          />
        ),
        ['data-test-subj']: `docViewerTab-${docView.id}`,
        ...getDocViewTabEbtProps(docView),
      }));

    const [storedInitialTabId, setInitialTabId] = useLocalStorage<string>(INITIAL_TAB);
    const [selectedTabId, setSelectedTabId] = useState<string | undefined>(
      initialTabId ? getFullTabId(initialTabId) : storedInitialTabId
    );
    const selectedTab =
      (selectedTabId ? tabs.find(({ id }) => id === selectedTabId) : undefined) ?? tabs.at(0);

    useEffect(() => {
      onUpdateSelectedTabId?.(selectedTabId ? getOriginalTabId(selectedTabId) : undefined);
    }, [onUpdateSelectedTabId, selectedTabId]);

    useImperativeHandle(
      ref,
      () => ({
        setSelectedTabId: (tabId: string) => {
          setSelectedTabId(getFullTabId(tabId));
          setInitialTabId(getFullTabId(tabId)); // Persist the selected tab in localStorage
        },
      }),
      [setInitialTabId]
    );

    const [initialDocViewerViewedEventKey, setInitialDocViewerViewedEventKey] = useRestorableState(
      'initialDocViewerViewedEventKey',
      undefined
    );

    // Emit the URL-shareable projection of the doc viewer state whenever the selected tab or a tab's
    // shareable slice changes.
    const docViewerTabsState = useRestorableStateValue('docViewerTabsState');
    const lastEmittedShareableStateRef = useRef<string>();
    const selectedOriginalTabId = selectedTab ? getOriginalTabId(selectedTab.id) : undefined;

    useEffect(() => {
      if (!onShareableStateChange) {
        return;
      }

      const shareableState = capShareableState({
        selectedTabId: selectedOriginalTabId,
        tabsState: projectShareableTabsState(docViews, docViewerTabsState),
      });

      const serialized = JSON.stringify(shareableState);

      if (serialized === lastEmittedShareableStateRef.current) {
        return;
      }

      lastEmittedShareableStateRef.current = serialized;
      onShareableStateChange(shareableState);
    }, [onShareableStateChange, docViews, docViewerTabsState, selectedOriginalTabId]);

    useDocViewerTabViewedEvent({
      reportEvent,
      tabId: selectedTab ? getOriginalTabId(selectedTab.id) : undefined,
      originDocType,
      hit: renderProps.hit,
      initialEventKey: initialDocViewerViewedEventKey,
      onEventKeyChange: setInitialDocViewerViewedEventKey,
    });

    const onTabClick = useCallback(
      (tab: EuiTabbedContentTab) => {
        setSelectedTabId(tab.id);
        setInitialTabId(tab.id); // Persist the selected tab in localStorage
      },
      [setInitialTabId]
    );

    if (!tabs.length) {
      // There's a minimum of 2 tabs active in Discover.
      // This condition takes care of unit tests with 0 tabs.
      return null;
    }

    return (
      <div className="kbnDocViewer" data-test-subj="kbnDocViewer">
        <EuiTabbedContent size="s" tabs={tabs} selectedTab={selectedTab} onTabClick={onTabClick} />
      </div>
    );
  }
);

export const DocViewer = withRestorableState(InternalDocViewer);

export type DocViewerProps = ComponentProps<typeof DocViewer>;
export type DocViewerApi = ComponentRef<typeof DocViewer>;
