/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render } from 'react-dom';
import { v4 as uuidV4 } from 'uuid';

import type { EuiFlyoutMenuProps } from '@elastic/eui';
import { EuiFlyout, getFlyoutManagerStore } from '@elastic/eui';
import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import type {
  OverlaySystemFlyoutOpenOptions,
  OverlaySystemFlyoutStart,
  SystemFlyoutType,
} from '@kbn/core-overlays-browser';
import { SystemFlyoutTypeContext } from '@kbn/core-overlays-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { SystemFlyoutRef } from './system_flyout_ref';

interface SystemFlyoutTypeControllerProps {
  /** The `type` open option, used to seed the reactive state. */
  initialType: SystemFlyoutType | undefined;
  /**
   * Render-prop receiving the current (reactive) flyout type, so the enclosing
   * `EuiFlyout` markup only needs to thread `type` through.
   */
  children: (type: SystemFlyoutType) => React.ReactNode;
}

/**
 * Owns the reactive push/overlay `type` of a system flyout and exposes it via
 * {@link SystemFlyoutTypeContext}. Because the state lives here — above the
 * `EuiFlyout` — content rendered inside the flyout can switch push/overlay and
 * have the live flyout re-render, rather than the change only applying on the
 * next open.
 */
const SystemFlyoutTypeController: React.FC<SystemFlyoutTypeControllerProps> = ({
  initialType,
  children,
}) => {
  const [type, setType] = React.useState<SystemFlyoutType>(initialType ?? 'overlay');
  const value = React.useMemo(() => ({ type, setType }), [type]);
  return (
    <SystemFlyoutTypeContext.Provider value={value}>
      {children(type)}
    </SystemFlyoutTypeContext.Provider>
  );
};

interface SystemFlyoutStartDeps {
  analytics: AnalyticsServiceStart;
  i18n: I18nStart;
  theme: ThemeServiceStart;
  userProfile: UserProfileService;
  targetDomElement: Element;
}

/**
 * Service for managing system flyouts that integrate with the EUI Flyout Manager.
 * Supports non-React contexts while preserving React context and EUI Flyout System features.
 */
export class SystemFlyoutService {
  private targetDomElement: Element | null = null;
  private activeFlyouts = new Map<string, SystemFlyoutRef>();
  /**
   * The element EUI applies push-flyout offset padding to (the flyout manager's container element),
   * captured while non-null. Used by {@link resetPushOffsetIfIdle} to clear a stranded offset once
   * the last flyout closes.
   */
  private pushOffsetContainer: HTMLElement | null = null;
  private managerUnsubscribe: (() => void) | null = null;

  public start({
    analytics,
    i18n,
    theme,
    userProfile,
    targetDomElement,
  }: SystemFlyoutStartDeps): OverlaySystemFlyoutStart {
    this.targetDomElement = targetDomElement;

    // A `type="push"` flyout makes EUI write inline offset padding onto its container element (or
    // `document.body`). Each system flyout renders in its own React root, so EUI's per-flyout
    // cleanup of that padding can race across roots and strand the offset on the container when the
    // flyouts tear down. Track the container while it's set so we can reset it on the last close.
    if (!this.managerUnsubscribe) {
      const managerStore = getFlyoutManagerStore();
      this.managerUnsubscribe = managerStore.subscribe(() => {
        const containerElement = managerStore.getState().containerElement;
        if (containerElement) {
          this.pushOffsetContainer = containerElement;
        }
      });
    }

    return {
      open: (
        content: React.ReactElement,
        { session = 'start', title, ...options }: OverlaySystemFlyoutOpenOptions = {}
      ): OverlayRef => {
        const { flyoutMenuProps } = options;
        const flyoutId = `system-flyout-${uuidV4()}`;

        // Create a container for this flyout within the main React tree
        const flyoutContainer = document.createElement('div');
        flyoutContainer.setAttribute('data-system-flyout', flyoutId);
        this.targetDomElement!.appendChild(flyoutContainer);

        const flyoutRef = new SystemFlyoutRef(flyoutContainer);
        this.activeFlyouts.set(flyoutId, flyoutRef);

        // Handle close events
        flyoutRef.onClose.then(() => {
          this.activeFlyouts.delete(flyoutId);
          this.resetPushOffsetIfIdle();
        });

        const onCloseFlyout = () => {
          if (options.onClose) {
            options.onClose(flyoutRef);
          }
          flyoutRef.close();
        };

        // title and other flyoutMenuProps: flyoutMenuProps.title takes precedence over top-level title
        let mergedFlyoutMenuProps: EuiFlyoutMenuProps | undefined;
        if (title || flyoutMenuProps) {
          mergedFlyoutMenuProps = { title, ...flyoutMenuProps };
        }

        // Subscribe to CLOSE_SESSION events for cascade closes of child flyouts.
        // When a parent session closes, child flyouts in separate React roots must
        // be explicitly closed since their deferred useEffect detection may not fire
        // reliably across roots.
        //
        // IMPORTANT: We only handle child flyouts here (session === 'inherit').
        // Main flyouts (session === 'start') must NOT be closed synchronously via
        // this handler because unmountComponentAtNode triggers a useLayoutEffect
        // cleanup that reads a stale ref (flyoutExistsInManagerRef) and calls
        // closeAllFlyouts(), which would inadvertently close unrelated sessions
        // (e.g., during goBack navigation).
        if (session === 'inherit') {
          const euiFlyoutId = options.id || flyoutId;
          const { subscribeToEvents } = getFlyoutManagerStore();

          const unsubscribe = subscribeToEvents((event) => {
            if (event.type !== 'CLOSE_SESSION') {
              return;
            }

            const { childFlyoutId, childHistory } = event.session;
            const shouldClose =
              euiFlyoutId === childFlyoutId ||
              childHistory?.some((entry) => entry.flyoutId === euiFlyoutId);

            if (shouldClose && !flyoutRef.isClosed) {
              flyoutRef.close();
              unsubscribe();
              this.activeFlyouts.delete(flyoutId);
            }
          });

          // Clean up subscription when flyout closes normally
          flyoutRef.onClose.then(() => {
            unsubscribe();
          });
        }

        // Render the flyout content using EuiFlyout with session management
        // This ensures full EUI Flyout System integration
        render(
          <KibanaRenderContextProvider
            analytics={analytics}
            i18n={i18n}
            theme={theme}
            userProfile={userProfile}
          >
            <SystemFlyoutTypeController initialType={options.type as SystemFlyoutType | undefined}>
              {(type) => (
                <EuiFlyout
                  {...options}
                  type={type}
                  flyoutMenuProps={mergedFlyoutMenuProps}
                  session={session}
                  onClose={onCloseFlyout}
                  aria-label={options['aria-label']}
                  aria-labelledby={options['aria-labelledby']}
                >
                  {content}
                </EuiFlyout>
              )}
            </SystemFlyoutTypeController>
          </KibanaRenderContextProvider>,
          flyoutContainer
        );

        return flyoutRef;
      },
    };
  }

  /**
   * Reset any push-flyout offset once no flyouts remain open.
   *
   * A `type="push"` flyout makes EUI write inline offset padding onto its container element (the app
   * content area) or `document.body`. Because each system flyout renders in its own React root,
   * EUI's per-flyout cleanup of that padding can race across roots and leave the offset stranded on
   * teardown — the page stays pushed with no flyout open. Once nothing is open there can be no push
   * offset, so clear it deterministically here.
   */
  private resetPushOffsetIfIdle(): void {
    if (this.activeFlyouts.size > 0) {
      return;
    }
    this.clearStrandedPushOffset();
    // A late effect or ResizeObserver callback from the tearing-down flyout roots can re-apply the
    // offset after this microtask, so clear once more on the next frame — still only while idle.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (this.activeFlyouts.size === 0) {
          this.clearStrandedPushOffset();
        }
      });
    }
  }

  /**
   * Remove any inline push-offset padding EUI left on the flyout container (resolved from both the
   * tracked reference and the live manager store) or `document.body`. Only inline styles are
   * touched, so the chrome layout's own `padding` rules are unaffected.
   */
  private clearStrandedPushOffset(): void {
    const containerFromStore = getFlyoutManagerStore().getState().containerElement ?? null;
    const targets = [this.pushOffsetContainer, containerFromStore, document.body].filter(
      (el): el is HTMLElement => el != null
    );
    const paddingProps = ['padding-inline-start', 'padding-inline-end'];
    for (const el of targets) {
      for (const prop of paddingProps) {
        el.style.removeProperty(prop);
      }
    }
  }

  /**
   * Cleanup method for when the service is stopped
   */
  public closeAllFlyouts(): void {
    this.activeFlyouts.forEach((flyout) => flyout.close());
    this.activeFlyouts.clear();
    this.resetPushOffsetIfIdle();
  }

  public stop(): void {
    this.closeAllFlyouts();
    this.managerUnsubscribe?.();
    this.managerUnsubscribe = null;
    this.pushOffsetContainer = null;
    this.targetDomElement = null;
  }
}
