/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ReplaySubject, firstValueFrom, of, take, takeUntil, timeout } from 'rxjs';
import { i18n } from '@kbn/i18n';
import type { CoreStart } from '@kbn/core/public';
import type {
  ChromeProjectNavigationNode,
  NavigationCustomization,
} from '@kbn/core-chrome-browser';
import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal';
import type { SecurityPluginStart } from '@kbn/security-plugin/public';
import { getNavigationNodeIcon } from '@kbn/core-chrome-browser-navigation-utils';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { NAV_CUSTOMIZATION_STORAGE_KEY } from '../../common/constants';

/**
 * Upper bound for waiting on the first navigation snapshot when the modal is opened.
 * Falls back to empty lists instead of hanging the modal open if nav initialization triggers.
 */
const NAV_SNAPSHOT_TIMEOUT_MS = 5_000;

export interface NavigationCustomizationServiceStartDeps {
  core: CoreStart;
  chrome: InternalChromeStart;
  isUnauthenticated: boolean;
}

export interface NavigationCustomizationServiceUiDeps {
  core: CoreStart;
  chrome: InternalChromeStart;
  security?: SecurityPluginStart;
}

/**
 * Owns all navigation-customization concerns: stored-customization sync,
 * chrome handler registration, and user-menu link rendering.
 *
 * Both `handlerRegistered` and `menuLinkAdded` are tracked independently so
 * callers can invoke `enableUi` from different code paths (stateful handler
 * registration is synchronous; menu-link registration is async after the
 * active space resolves) without double-registering either capability.
 *
 * This file has no React or JSX. All UI is delegated to
 * `@kbn/navigation-customization-components` via dynamic imports.
 */
export class NavigationCustomizationService {
  private readonly stop$ = new ReplaySubject<void>(1);
  private handlerRegistered = false;
  private menuLinkAdded = false;

  /**
   * Applies the stored customization to the project navigation. Must be called
   * once per plugin lifecycle; skips if the user is unauthenticated.
   *
   * The stored value is seeded synchronously via `peek()` so the navigation has
   * the customization applied on first paint. The `get$()` subscription then
   * keeps it in sync with later updates (in-tab saves and multi-tab sync).
   */
  start({ core, chrome, isUnauthenticated }: NavigationCustomizationServiceStartDeps): void {
    if (isUnauthenticated) return;

    chrome.project.setNavigationCustomization(
      core.userStorage.peek<NavigationCustomization>(NAV_CUSTOMIZATION_STORAGE_KEY)
    );

    core.userStorage
      .get$<NavigationCustomization>(NAV_CUSTOMIZATION_STORAGE_KEY)
      .pipe(takeUntil(this.stop$))
      .subscribe((customization) => {
        chrome.project.setNavigationCustomization(customization);
      });
  }

  /**
   * Enables the customization UI. Each capability is independently idempotent:
   *
   * - Chrome handler: registered on the first call regardless of whether
   *   `security` is provided. Safe to call synchronously (before the active
   *   space is confirmed) because the handler is looked up lazily by chrome
   *   when the user actually clicks the customize button.
   *
   * - User-menu link: added the first time `security` is provided. In
   *   stateful mode this happens after the active space has confirmed a
   *   project-nav solution; in serverless mode both capabilities are enabled
   *   together inside the `getNavigation$` subscription.
   */
  enableUi({ core, chrome, security }: NavigationCustomizationServiceUiDeps): void {
    if (!this.handlerRegistered) {
      this.handlerRegistered = true;
      chrome.project.registerCustomizeNavigationHandler(() => this.openModal(core, chrome));
    }

    if (!this.menuLinkAdded && security) {
      this.menuLinkAdded = true;
      const openModal = () => this.openModal(core, chrome);
      // Lazy-load the helper — it pulls in React + EUI that must stay out of
      // the page-load bundle.
      import('@kbn/navigation-customization-components').then(({ createCustomizeNavMenuLink }) => {
        security.navControlService.addUserMenuLinks([createCustomizeNavMenuLink(openModal)]);
      });
    }
  }

  stop(): void {
    this.stop$.next();
  }

  private openModal(core: CoreStart, chrome: InternalChromeStart): void {
    const run = async () => {
      // Lazy-load the modal helper and computeMoves together so neither hits
      // the page-load bundle.
      const [{ openCustomizeNavigationModal }, { computeMoves }] = await Promise.all([
        import('@kbn/navigation-customization-components'),
        import('@kbn/core-chrome-navigation-customization'),
      ]);

      const { items, defaultItemIds } = await this.getNavigationItems(chrome);

      const savedCustomization = core.userStorage.get<NavigationCustomization>(
        NAV_CUSTOMIZATION_STORAGE_KEY
      );

      // Captured after mountModal is called synchronously by openCustomizeNavigationModal.
      let closeModal: () => void = () => {};

      openCustomizeNavigationModal({
        items,
        defaultItemIds,
        computeMoves,
        onChange: (c) => chrome.project.setNavigationCustomization(c),
        onSave: (c) => {
          // The live nav was already updated optimistically via onChange. The
          // server write can still fail (e.g. a read-only user lacks write
          // access to the user-storage saved object), so surface a toast rather
          // than letting the failure pass silently and the change vanish on the
          // next page load.
          //
          // When the user applied a reset (or manually returned every item to
          // its default position/visibility), the customization is the identity
          // — remove the stored key rather than writing an empty object so the
          // storage stays clean and a future page load starts with no key.
          const persist =
            c.moves.length === 0 && c.hidden.length === 0
              ? core.userStorage.remove(NAV_CUSTOMIZATION_STORAGE_KEY)
              : core.userStorage.set(NAV_CUSTOMIZATION_STORAGE_KEY, c);

          persist.catch((error: Error) => {
            // `toastMessage` provides a friendlier, actionable body than the raw
            // HTTP error (which is just "Internal Server Error"); the underlying
            // error stays available via the toast's "See the full error" action.
            core.notifications.toasts.addError(error, {
              title: i18n.translate('navigation.customization.saveErrorTitle', {
                defaultMessage: 'Unable to save navigation customization',
              }),
              toastMessage: i18n.translate('navigation.customization.saveErrorMessage', {
                defaultMessage:
                  'Your navigation customization could not be saved. You might not have permission to save preferences in this space.',
              }),
            });
          });
          closeModal();
        },
        onReset: () => {
          // Only update the live preview — the server write is deferred until
          // the user clicks Apply, keeping Reset consistent with the
          // preview-until-Apply model used by every other edit in this modal.
          // If the user cancels after a Reset, onClose restores savedCustomization
          // and the server is never touched, so the stored value is preserved.
          chrome.project.setNavigationCustomization(undefined);
          return this.getNavigationItems(chrome).then((nav) => nav.items);
        },
        onClose: () => {
          chrome.project.setNavigationCustomization(savedCustomization);
          closeModal();
        },
        // toMountPoint is a regular function (no JSX) — safe to import in .ts.
        mountModal: (element) => {
          const ref = core.overlays.openModal(
            toMountPoint(core.rendering.addContext(element), core)
          );
          closeModal = () => ref.close();
        },
      });
    };

    run();
  }

  private async getNavigationItems(chrome: InternalChromeStart): Promise<{
    items: Array<{ id: string; title: string; hidden: boolean; icon?: string }>;
    defaultItemIds: string[];
  }> {
    const nav = await firstValueFrom(
      chrome.project
        .getNavigation$()
        .pipe(take(1), timeout({ first: NAV_SNAPSHOT_TIMEOUT_MS, with: () => of(undefined) }))
    );

    if (!nav) {
      return { items: [], defaultItemIds: [] };
    }

    const overflowSet = new Set(nav.overflowItemIds);
    const items = nav.renderableNodes.map((node: ChromeProjectNavigationNode) => ({
      id: node.id,
      title: (node.title ?? node.id) as string,
      hidden: overflowSet.has(node.id),
      icon: getNavigationNodeIcon(node),
    }));

    return { items, defaultItemIds: nav.defaultItemIds };
  }
}
