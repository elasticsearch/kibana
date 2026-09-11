/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { EuiErrorBoundary, EuiPanel, htmlIdGenerator } from '@elastic/eui';
import { css } from '@emotion/react';
import type {
  PublishesFetchOnlyVisible,
  PublishesHideBorder,
  PublishesTitle,
} from '@kbn/presentation-publishing';
import { getViewModeSubject, useBatchedPublishingSubjects } from '@kbn/presentation-publishing';

import { BehaviorSubject } from 'rxjs';
import { PresentationPanelHeader } from './panel_header/presentation_panel_header';
import type { PresentationPanelHoverActionsProps } from './panel_header/presentation_panel_hover_actions';
import { PresentationPanelHoverActionsWrapper } from './panel_header/presentation_panel_hover_actions_wrapper';
import { PresentationPanelError } from './presentation_panel_error';
import type { DefaultPresentationPanelApi, PresentationPanelProps } from './types';
import { VisibilityTracker } from './visibility_tracker';

const PresentationPanelChrome = <
  ApiType extends DefaultPresentationPanelApi = DefaultPresentationPanelApi,
  ComponentPropsType extends {} = {}
>({
  children,

  index,
  hideHeader,
  showShadow,
  showBorder,
  showBadges,
  getActions,
  actionPredicate,
  titleHighlight,
  setDragHandle,
  componentApi,
  isSharedItem,
}: React.PropsWithChildren<
  Omit<
    PresentationPanelProps<ApiType, ComponentPropsType>,
    'hidePanelChrome' | 'setDragHandles' | 'Component' | 'componentProps' | 'componentInternalApi'
  > & {
    setDragHandle: PresentationPanelHoverActionsProps['setDragHandle'];
  }
>) => {
  const headerId = useMemo(() => htmlIdGenerator()(), []);

  const [
    dataLoading,
    blockingError,
    panelTitle,
    hidePanelTitle,
    panelDescription,
    defaultPanelTitle,
    defaultPanelDescription,
    rawViewMode,
    parentHidePanelTitle,
    rendered,
    renderCount,
  ] = useBatchedPublishingSubjects(
    componentApi.dataLoading$ ?? new BehaviorSubject(false),
    componentApi.blockingError$ ?? new BehaviorSubject(undefined),
    componentApi.title$ ?? new BehaviorSubject(undefined),
    componentApi.hideTitle$ ?? new BehaviorSubject(false),
    componentApi.description$ ?? new BehaviorSubject(undefined),
    componentApi.defaultTitle$ ?? new BehaviorSubject(undefined),
    componentApi.defaultDescription$ ?? new BehaviorSubject(undefined),
    getViewModeSubject(componentApi) ?? new BehaviorSubject(undefined),
    (componentApi.parentApi as Partial<PublishesTitle>)?.hideTitle$ ?? new BehaviorSubject(false),
    componentApi.rendered$ ?? new BehaviorSubject(true),
    componentApi.renderCount$ ?? new BehaviorSubject(undefined)
  );
  const viewMode = rawViewMode ?? 'view';

  const hideTitle =
    Boolean(hidePanelTitle) ||
    Boolean(parentHidePanelTitle) ||
    !Boolean(panelTitle ?? defaultPanelTitle);

  const dataAttributes = useMemo(() => {
    const dataTitle = panelTitle ?? defaultPanelTitle;
    const dataDescription = panelDescription ?? defaultPanelDescription;

    return {
      ['data-render-complete']: Boolean(blockingError) || (!dataLoading && rendered),
      ...(renderCount !== undefined && { ['data-rendering-count']: renderCount }),
      ...(isSharedItem && { 'data-shared-item': '' }),
      ...(dataTitle && { ['data-title']: dataTitle }),
      ...(dataDescription && { ['data-description']: dataDescription }),
    };
  }, [
    blockingError,
    defaultPanelDescription,
    panelDescription,
    panelTitle,
    defaultPanelTitle,
    dataLoading,
    rendered,
    renderCount,
    isSharedItem,
  ]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstRenderCompleteRef = useRef(false);
  useEffect(() => {
    if (!firstRenderCompleteRef.current && dataAttributes['data-render-complete']) {
      firstRenderCompleteRef.current = true;
      if (isSharedItem && panelRef.current) {
        panelRef.current.dispatchEvent(new CustomEvent('renderComplete', { bubbles: true }));
      }
    }
  }, [dataAttributes, isSharedItem]);

  return (
    <PresentationPanelHoverActionsWrapper
      {...{
        index,
        api: componentApi,
        getActions,
        actionPredicate,
        viewMode,
        showBorder,
      }}
      setDragHandle={setDragHandle}
    >
      <EuiPanel
        role="figure"
        paddingSize="none"
        className={classNames('embPanel', {
          'embPanel--editing': viewMode === 'edit',
        })}
        hasShadow={showShadow}
        aria-labelledby={headerId}
        data-test-subj="embeddablePanel"
        {...dataAttributes}
        panelRef={panelRef}
        css={styles.embPanel}
      >
        {!hideHeader && (
          <PresentationPanelHeader
            api={componentApi}
            setDragHandle={setDragHandle}
            headerId={headerId}
            viewMode={viewMode}
            hideTitle={hideTitle}
            showBadges={showBadges}
            getActions={getActions}
            panelTitle={panelTitle ?? defaultPanelTitle}
            panelDescription={panelDescription ?? defaultPanelDescription}
            titleHighlight={titleHighlight}
          />
        )}
        {children}
      </EuiPanel>
    </PresentationPanelHoverActionsWrapper>
  );
};

export const PresentationPanel = <
  ApiType extends DefaultPresentationPanelApi = DefaultPresentationPanelApi,
  ComponentPropsType extends {} = {}
>({
  Component,
  componentApi,
  componentInternalApi,
  componentProps,

  setDragHandles,
  hidePanelChrome,
  ...rest
}: PresentationPanelProps<ApiType, ComponentPropsType>) => {
  const [blockingError, panelHideBorder, parentHideBorder, fetchOnlyVisible] =
    useBatchedPublishingSubjects(
      componentApi.blockingError$ ?? new BehaviorSubject(undefined),
      componentApi.hideBorder$ ?? new BehaviorSubject(false),
      (componentApi.parentApi as Partial<PublishesHideBorder>)?.hideBorder$ ??
        new BehaviorSubject(false),
      (componentApi.parentApi as Partial<PublishesFetchOnlyVisible>)?.fetchOnlyVisible$ ??
        new BehaviorSubject(false)
    );
  const hideBorder = Boolean(panelHideBorder) || Boolean(parentHideBorder);

  const dragHandles = useRef<{ [dragHandleKey: string]: HTMLElement | null }>({});

  const setDragHandle = useCallback(
    (id: string, ref: HTMLElement | null) => {
      dragHandles.current[id] = ref;
      setDragHandles?.(Object.values(dragHandles.current));
    },
    [setDragHandles]
  );

  const InnerPanel = useMemo(() => {
    return (
      <>
        {fetchOnlyVisible && (
          <VisibilityTracker setVisibility={componentInternalApi.setVisibility} />
        )}
        {blockingError && <PresentationPanelError api={componentApi} error={blockingError} />}
        <div
          className={blockingError ? 'embPanel__content--hidden' : 'embPanel__content'}
          css={styles.embPanelContent}
        >
          <EuiErrorBoundary>
            <Component {...(componentProps as React.ComponentProps<typeof Component>)} />
          </EuiErrorBoundary>
        </div>
      </>
    );
  }, [
    blockingError,
    componentApi,
    Component,
    componentProps,
    componentInternalApi.setVisibility,
    fetchOnlyVisible,
  ]);

  return hidePanelChrome ? (
    InnerPanel
  ) : (
    <PresentationPanelChrome
      {...rest}
      componentApi={componentApi}
      showBorder={hideBorder ? false : rest.showBorder}
      showShadow={hideBorder ? false : rest.showShadow}
      setDragHandle={setDragHandle}
    >
      {InnerPanel}
    </PresentationPanelChrome>
  );
};

/**
 * if there is no reliance on EUI theme, then it is more performant to store styles as minimizable objects
 * outside of the React component so that it is not parsed on every render
 */
const styles = {
  embPanel: css({
    zIndex: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  }),
  embPanelContent: css({
    '&.embPanel__content': {
      display: 'flex',
      flex: '1 1 100%',
      zIndex: 1,
      minHeight: 0, // Absolute must for Firefox to scroll contents
      overflow: 'hidden',
      height: '100%',
    },
    '&.embPanel__content--hidden, &[data-error]': {
      display: 'none',
    },
  }),
};
