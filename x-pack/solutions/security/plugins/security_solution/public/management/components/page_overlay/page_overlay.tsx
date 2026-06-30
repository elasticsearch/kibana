/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CSSProperties, ReactNode } from 'react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { Global } from '@emotion/react';
import { EuiFocusTrap, EuiPortal } from '@elastic/eui';
import classnames from 'classnames';
import { useLocation } from 'react-router-dom';
import type { EuiPortalProps } from '@elastic/eui/src/components/portal/portal';
import { useIsMounted } from '@kbn/securitysolution-hook-utils';
import { euiIncludeSelectorInFocusTrap, layoutVar } from '@kbn/core-chrome-layout-constants';

import { useHasFullScreenContent } from '../../../common/containers/use_full_screen';
import { FULL_SCREEN_CONTENT_OVERRIDES_CSS_STYLESHEET } from '../../../common/components/page';

const OverlayRootContainer = styled.div`
  border: none;

  display: block;
  position: fixed;
  overflow: hidden;

  top: ${layoutVar('application.top', '0px')};
  bottom: ${layoutVar('application.bottom', '0px')};
  right: ${layoutVar('application.right', '0px')};
  left: ${layoutVar('application.left', '0px')};

  border-left: 1px solid ${({ theme }) => theme.euiTheme.colors.backgroundBaseSubdued};

  // We're adding 500 to ensure that the overlay sits above the EUI flyout stacking range (each stacked flyout bumps its z-index by 3).
  // Users would have to go through over 150 flyouts before getting into a position where the overlay would be behind the flyouts.
  // We also want to ensure that popovers, dropdowns, and tooltips still render on top of the overlay, those are at 2000.
  z-index: ${({ theme }) => (theme.euiTheme.levels.flyout as number) + 500};

  background-color: ${({ theme }) => theme.euiTheme.colors.backgroundBasePlain};

  &.scrolling {
    overflow: auto;
  }

  &.hidden {
    display: none;
  }

  &.padding-xs {
    padding: ${({ theme }) => theme.euiTheme.size.xs};
  }
  &.padding-s {
    padding: ${({ theme }) => theme.euiTheme.size.s};
  }
  &.padding-m {
    padding: ${({ theme }) => theme.euiTheme.size.m};
  }
  &.padding-l {
    padding: ${({ theme }) => theme.euiTheme.size.l};
  }
  &.padding-xl {
    padding: ${({ theme }) => theme.euiTheme.size.xl};
  }

  &.fullScreen {
    top: 0;
    height: 100%;
  }

  .fullHeight {
    height: 100%;
  }
`;

const PAGE_OVERLAY_CSS_CLASSNAME = 'securitySolution-pageOverlay';
export const PAGE_OVERLAY_DOCUMENT_BODY_IS_VISIBLE_CLASSNAME = `${PAGE_OVERLAY_CSS_CLASSNAME}-isVisible`;
export const PAGE_OVERLAY_DOCUMENT_BODY_LOCK_CLASSNAME = `${PAGE_OVERLAY_CSS_CLASSNAME}-lock`;
export const PAGE_OVERLAY_DOCUMENT_BODY_FULLSCREEN_CLASSNAME = `${PAGE_OVERLAY_CSS_CLASSNAME}-fullScreen`;
export const PAGE_OVERLAY_DOCUMENT_BODY_OVER_PAGE_WRAPPER_CLASSNAME = `${PAGE_OVERLAY_CSS_CLASSNAME}-overSecuritySolutionPageWrapper`;

const PageOverlayGlobalStyles = () => (
  <Global
    styles={`
      body.${PAGE_OVERLAY_DOCUMENT_BODY_LOCK_CLASSNAME} {
        overflow: hidden;
      }

  //-------------------------------------------------------------------------------------------
  // Style overrides for when Page Overlay is in full screen mode
  //-------------------------------------------------------------------------------------------
  // Needs to override some position of EUI components to ensure they are displayed correctly
  // when the top Kibana header is not visible
  //-------------------------------------------------------------------------------------------
      body.${PAGE_OVERLAY_DOCUMENT_BODY_FULLSCREEN_CLASSNAME} {
        ${FULL_SCREEN_CONTENT_OVERRIDES_CSS_STYLESHEET}
      }
    `}
  />
);

const setDocumentBodyOverlayIsVisible = () => {
  document.body.classList.add(PAGE_OVERLAY_DOCUMENT_BODY_IS_VISIBLE_CLASSNAME);
};

const unSetDocumentBodyOverlayIsVisible = () => {
  document.body.classList.remove(PAGE_OVERLAY_DOCUMENT_BODY_IS_VISIBLE_CLASSNAME);
};

const setDocumentBodyLock = () => {
  document.body.classList.add(PAGE_OVERLAY_DOCUMENT_BODY_LOCK_CLASSNAME);
};

const unSetDocumentBodyLock = () => {
  document.body.classList.remove(PAGE_OVERLAY_DOCUMENT_BODY_LOCK_CLASSNAME);
};

const setDocumentBodyFullScreen = () => {
  document.body.classList.add(PAGE_OVERLAY_DOCUMENT_BODY_FULLSCREEN_CLASSNAME);
};

const unSetDocumentBodyFullScreen = () => {
  document.body.classList.remove(PAGE_OVERLAY_DOCUMENT_BODY_FULLSCREEN_CLASSNAME);
};

const setDocumentBodyOverPageWrapper = () => {
  document.body.classList.add(PAGE_OVERLAY_DOCUMENT_BODY_OVER_PAGE_WRAPPER_CLASSNAME);
};

const unSetDocumentBodyOverPageWrapper = () => {
  document.body.classList.remove(PAGE_OVERLAY_DOCUMENT_BODY_OVER_PAGE_WRAPPER_CLASSNAME);
};

export interface PageOverlayProps {
  children: ReactNode;

  /**
   * Callback for when the user leaves the overlay
   */
  onHide: () => void;

  /** If the overlay should be hidden. NOTE: it will remain rendered/mounted, but `display: none` */
  isHidden?: boolean;

  /**
   * Setting this to `true` (default) will enable scrolling inside of the overlay
   */
  enableScrolling?: boolean;

  /**
   * When set to `true` (default), the browser's scroll bar will be "locked" (`overflow: hidden`),
   * so that the only scroll bar visible (possibly) is the one inside of the overlay
   */
  lockDocumentBody?: boolean;

  /**
   * If `true` (default), then the page's URL `pathname` will be tracked when the overlay is shown, and if
   * the pathname changes, the `onHide()` prop will be called.
   */
  hideOnUrlPathnameChange?: boolean;

  /**
   * Optional padding size around the overlay
   */
  paddingSize?: 'xs' | 's' | 'm' | 'l' | 'xl';

  /**
   * If set to `true` (default), whenever the page overlay is displayed (either mounted or when
   * `isHidden` goes form `false` to `true`), it will be moved so that  it is the last child of
   * inside of the `<body>`. This happens only when the page overlay is displayed
   * (ie. it does NOT attempt to track nodes added/removed from `<body>` in order to ensure
   * it is always the last one).
   */
  appendAsBodyLastNode?: boolean;

  /**
   * Explicitly set the overlay's z-index. Use with caution.
   */
  zIndex?: CSSProperties['zIndex'];

  'data-test-subj'?: string;
}

/**
 * A generic component for taking over the entire Kibana UI main content area (everything below the
 * top header that includes the breadcrumbs). This component adds nothing more than a blank page - its up
 * to the `children` pass to actually display any type of intractable UI for the user.
 */
export const PageOverlay = memo<PageOverlayProps>(
  ({
    children,
    onHide,
    isHidden = false,
    enableScrolling = true,
    hideOnUrlPathnameChange = true,
    lockDocumentBody = true,
    appendAsBodyLastNode = true,
    paddingSize,
    zIndex,
    'data-test-subj': dataTestSubj,
  }) => {
    const { pathname } = useLocation();
    const isMounted = useIsMounted();
    const showInFullScreen = useHasFullScreenContent();
    const [openedOnPathName, setOpenedOnPathName] = useState<null | string>(null);
    const portalEleRef = useRef<HTMLElement | null>();

    const setPortalEleRef = useCallback<NonNullable<EuiPortalProps['portalRef']>>((node) => {
      portalEleRef.current = node;
    }, []);

    const containerCssOverrides = useMemo<CSSProperties>(() => {
      const css: CSSProperties = {};

      if (zIndex) {
        css.zIndex = zIndex;
      }

      return css;
    }, [zIndex]);

    const containerClassName = useMemo(() => {
      return classnames({
        [PAGE_OVERLAY_CSS_CLASSNAME]: true,
        scrolling: enableScrolling,
        hidden: isHidden,
        fullScreen: showInFullScreen,
        'eui-scrollBar': enableScrolling,
        'padding-xs': paddingSize === 'xs',
        'padding-s': paddingSize === 's',
        'padding-m': paddingSize === 'm',
        'padding-l': paddingSize === 'l',
        'padding-xl': paddingSize === 'xl',
      });
    }, [enableScrolling, isHidden, paddingSize, showInFullScreen]);

    // Capture the URL `pathname` that the overlay was opened for
    useEffect(() => {
      if (isMounted()) {
        setOpenedOnPathName((prevState) => {
          if (isHidden) {
            return null;
          } else {
            // capture pathname if not yet set (first show)
            if (!prevState) {
              // append the portal to the end of `<body>`?
              if (appendAsBodyLastNode && portalEleRef.current) {
                document.body.appendChild(portalEleRef.current);
              }

              return pathname;
            }
          }

          return prevState;
        });
      }
    }, [appendAsBodyLastNode, isHidden, isMounted, pathname]);

    // If `hideOnUrlPathNameChange` is true, then determine if the pathname changed and if so, call `onHide()`
    useEffect(() => {
      if (
        isMounted() &&
        hideOnUrlPathnameChange &&
        !isHidden &&
        openedOnPathName &&
        openedOnPathName !== pathname
      ) {
        onHide();
      }
    }, [hideOnUrlPathnameChange, isHidden, isMounted, onHide, openedOnPathName, pathname]);

    // Handle adding class names to the `document.body` DOM element
    useEffect(() => {
      if (isMounted()) {
        const isOverSecuritySolutionPageWrapper = Boolean(
          document.querySelector('.securitySolutionWrapper')
        );

        if (isHidden) {
          unSetDocumentBodyOverlayIsVisible();
          unSetDocumentBodyLock();
          unSetDocumentBodyFullScreen();
          unSetDocumentBodyOverPageWrapper();
        } else {
          setDocumentBodyOverlayIsVisible();

          if (lockDocumentBody) {
            setDocumentBodyLock();
          }

          if (showInFullScreen) {
            setDocumentBodyFullScreen();
          }

          if (isOverSecuritySolutionPageWrapper) {
            setDocumentBodyOverPageWrapper();
          }
        }
      }

      return () => {
        unSetDocumentBodyLock();
        unSetDocumentBodyOverlayIsVisible();
        unSetDocumentBodyFullScreen();
        unSetDocumentBodyOverPageWrapper();
      };
    }, [isHidden, isMounted, lockDocumentBody, showInFullScreen]);

    const focusTrapShards = useMemo(() => {
      return new Proxy([], {
        get(_, prop) {
          const elements = Array.from(
            document.querySelectorAll(euiIncludeSelectorInFocusTrap.selector)
          );
          const value = Reflect.get(elements, prop);

          return typeof value === 'function' ? value.bind(elements) : value;
        },
      });
    }, []);

    // Close the overlay on Escape, revealing whatever is behind it (e.g. a flyout).
    // The listener is attached to `document`, which sits below `window` in the DOM bubble path, so
    // `stopPropagation()` prevents the Escape from reaching the window-level `keydown` handlers of
    // underlying layers - notably `EuiFlyout` (via `EuiWindowEvent`), which would otherwise close the
    // flyout instead. Because we stop the event below `window`, this works regardless of which layer
    // mounted first. Inner widgets that handle Escape themselves (e.g. the console's input popover,
    // via `EuiPopover`) call `stopPropagation()` before the event bubbles to `document`, so they keep
    // precedence. Only active while the overlay is actually visible.
    useEffect(() => {
      if (isHidden) {
        return;
      }

      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || ev.defaultPrevented) {
          return;
        }

        ev.stopPropagation();
        ev.preventDefault();
        onHide();
      };

      document.addEventListener('keydown', onKeyDown);

      return () => {
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [isHidden, onHide]);

    return (
      <EuiPortal portalRef={setPortalEleRef}>
        <OverlayRootContainer
          data-test-subj={dataTestSubj}
          className={containerClassName}
          style={containerCssOverrides}
        >
          <EuiFocusTrap data-test-subj="trap-focus" className="fullHeight" shards={focusTrapShards}>
            {children}
          </EuiFocusTrap>
        </OverlayRootContainer>
        <PageOverlayGlobalStyles />
      </EuiPortal>
    );
  }
);
PageOverlay.displayName = 'PageOverlay';
