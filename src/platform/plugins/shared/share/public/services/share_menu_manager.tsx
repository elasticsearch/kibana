/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { createRef } from 'react';
import ReactDOM from 'react-dom';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { CoreStart, OverlayFlyoutOpenOptions } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { RenderingService } from '@kbn/core-rendering-browser';
import type { InjectedIntl } from '@kbn/i18n-react';
import type {
  ShowShareMenuOptions,
  ShareConfigs,
  ExportShareConfig,
  ExportShareDerivativesConfig,
} from '../types';
import type { ShareRegistry } from './share_menu_registry';
import { ShareMenu } from '../components/share_tabs';
import {
  ExportMenu,
  ManagedExportFlyout,
  type ManagedExportFlyoutProps,
} from '../components/export_integrations';
import { ShareProvider, type IShareContext } from '../components/context';

interface ShareMenuManagerStartDeps {
  core: CoreStart;
  isServerless: boolean;
  resolveShareItemsForShareContext: ShareRegistry['resolveShareItemsForShareContext'];
}

export class ShareMenuManager {
  private isOpen = false;
  private container = document.createElement('div');

  start({ core, resolveShareItemsForShareContext, isServerless }: ShareMenuManagerStartDeps) {
    return {
      /**
       * Collects share menu items from registered providers and mounts the share context menu under
       * the given `anchorElement`. If the context menu is already opened, a call to this method closes it.
       * @param options
       */
      toggleShareContextMenu: async (options: ShowShareMenuOptions) => {
        const onClose = () => {
          this.onClose();
          options.onClose?.();
        };

        const menuItems = await resolveShareItemsForShareContext({
          ...options,
          isServerless,
          onClose,
        });

        this.toggleShareContextMenu(
          {
            ...options,
            onClose,
            menuItems,
            publicAPIEnabled: !isServerless,
          },
          core.rendering
        );
      },

      /**
       * Returns a handler to trigger a specific export integration by ID.
       * For direct exports, executes immediately; otherwise opens a flyout.
       */
      getExportHandler: async (
        options: Omit<ShowShareMenuOptions, 'asExport' | 'anchorElement'>,
        exportId: string,
        intl: InjectedIntl
      ): Promise<(() => Promise<void>) | null> => {
        return this.createExportHandler(
          core,
          options,
          resolveShareItemsForShareContext,
          isServerless,
          (menuItems, getFlyoutSession, onClose) => {
            const exportIntegration = menuItems.find(
              (item) =>
                item.shareType === 'integration' &&
                item.id === exportId &&
                item.groupId === 'export'
            );

            if (!exportIntegration) {
              return null;
            }

            const exportConfig = exportIntegration.config as ExportShareConfig['config'];

            // Direct export (no UI needed) - execute immediately
            if (
              !exportConfig.copyAssetURIConfig &&
              !exportConfig.generateAssetComponent &&
              exportConfig.generateAssetExport
            ) {
              return async () => {
                await exportConfig
                  .generateAssetExport({
                    intl,
                    optimizedForPrinting: false,
                  })
                  .finally(onClose);
              };
            }

            return {
              flyoutContent: (
                <ManagedExportFlyout
                  exportIntegration={exportIntegration as ExportShareConfig}
                  intl={intl}
                  isDirty={options.isDirty}
                  onCloseFlyout={() => {
                    getFlyoutSession().close();
                    onClose();
                  }}
                  publicAPIEnabled={!isServerless}
                  shareObjectType={options.objectType}
                  shareObjectTypeAlias={options.objectTypeAlias}
                  shareObjectTypeMeta={
                    options.objectTypeMeta as ManagedExportFlyoutProps['shareObjectTypeMeta']
                  }
                  onSave={options.onSave}
                  isSaving={false}
                  sharingData={options.sharingData}
                  shareableUrlLocatorParams={options.shareableUrlLocatorParams}
                />
              ),
              overlayOptions: {
                'data-test-subj': 'exportItemDetailsFlyout',
                size: 's',
                ownFocus: true,
                container: null, // "global" flyout,
                'aria-label':
                  exportConfig.flyoutAriaLabel ??
                  i18n.translate('share.export.flyoutAriaLabel', {
                    defaultMessage: 'Export',
                  }),
              },
            };
          }
        );
      },

      /**
       * Returns a handler to trigger an export derivative by ID, opening its custom flyout.
       */
      getExportDerivativeHandler: async (
        options: Omit<ShowShareMenuOptions, 'asExport' | 'anchorElement'>,
        derivativeId: string
      ): Promise<(() => Promise<void>) | null> => {
        return this.createExportHandler(
          core,
          options,
          resolveShareItemsForShareContext,
          isServerless,
          (menuItems, getFlyoutSession, onClose) => {
            const derivative = menuItems.find(
              (item) =>
                item.shareType === 'integration' &&
                item.groupId === 'exportDerivatives' &&
                item.id === derivativeId
            );

            if (!derivative) {
              return null;
            }

            const exportItems = menuItems.filter(
              (item) => item.shareType === 'integration' && item.groupId === 'export'
            ) as ExportShareConfig[];

            const derivativeConfig = (derivative as ExportShareDerivativesConfig).config;

            if (!derivativeConfig.shouldRender({ availableExportItems: exportItems })) {
              return null;
            }

            const flyoutRef = createRef<HTMLDivElement>();

            return {
              flyoutContent: derivativeConfig.flyoutContent({
                closeFlyout: () => {
                  getFlyoutSession().close();
                  onClose();
                },
                flyoutRef,
              }),
              overlayOptions: {
                'data-test-subj': `exportDerivativeFlyout-${derivativeId}`,
                ownFocus: true,
                container: null, // "global" flyout,
                'aria-label':
                  derivativeConfig.flyoutAriaLabel ??
                  i18n.translate('share.export.flyoutAriaLabel', {
                    defaultMessage: 'Export',
                  }),
                ...(derivativeConfig.flyoutSizing || {}),
              },
            };
          }
        );
      },
    };
  }

  /**
   * Method for handling export operations flexibly.
   */
  private async createExportHandler(
    core: CoreStart,
    options: Omit<ShowShareMenuOptions, 'asExport' | 'anchorElement'>,
    resolveShareObjectTypeItems: ShareRegistry['resolveShareItemsForShareContext'],
    isServerless: boolean,
    cb: (
      objectTypeMenuItems: ShareConfigs[],
      /**
       * Returns the flyout session object for the current export integration.
       * Hence its return value will be undefined until the flyout has been created.
       */
      getFlyoutSession: () => ReturnType<typeof core.overlays.openFlyout>,
      onClose: () => void
    ) =>
      | null
      | (() => Promise<void>)
      | {
          flyoutContent: React.ReactNode | null;
          overlayOptions?: OverlayFlyoutOpenOptions;
        }
  ) {
    const onClose = () => {
      this.onClose();
      options.onClose?.();
    };

    const menuItems = await resolveShareObjectTypeItems({
      ...options,
      isServerless,
      onClose,
    });

    const shareContext: IShareContext = {
      objectId: options.objectId,
      objectType: options.objectType,
      objectTypeAlias: options.objectTypeAlias,
      objectTypeMeta: options.objectTypeMeta,
      publicAPIEnabled: !isServerless,
      allowShortUrl: options.allowShortUrl,
      sharingData: options.sharingData,
      shareableUrl: options.shareableUrl,
      shareableUrlLocatorParams: options.shareableUrlLocatorParams,
      isDirty: options.isDirty,
      shareMenuItems: menuItems,
      onClose,
      onSave: options.onSave,
    };

    let flyoutSession: ReturnType<typeof core.overlays.openFlyout>;

    const cbResult = await cb(menuItems, () => flyoutSession, onClose);

    if (!cbResult) {
      return null;
    }

    if (typeof cbResult === 'function') {
      return cbResult;
    }

    return async () => {
      flyoutSession = core.overlays.openFlyout(
        toMountPoint(
          <ShareProvider shareContext={shareContext}>{cbResult.flyoutContent}</ShareProvider>,
          core
        ),
        cbResult.overlayOptions
      );
    };
  }

  private onClose = () => {
    ReactDOM.unmountComponentAtNode(this.container);
    this.isOpen = false;
  };

  private toggleShareContextMenu(
    {
      anchorElement,
      allowShortUrl,
      objectId,
      objectType,
      objectTypeAlias,
      objectTypeMeta,
      sharingData,
      menuItems,
      shareableUrl,
      shareableUrlLocatorParams,
      onClose,
      isDirty,
      asExport,
      publicAPIEnabled,
      onSave,
    }: ShowShareMenuOptions & {
      menuItems: ShareConfigs[];
      onClose: () => void;
    },
    rendering: RenderingService
  ) {
    if (this.isOpen) {
      onClose();
      return;
    }

    document.body.appendChild(this.container);

    // initialize variable that will hold reference for unmount
    let unmount: ReturnType<ReturnType<typeof toMountPoint>>;

    const mount = toMountPoint(
      React.createElement(asExport ? ExportMenu : ShareMenu, {
        shareContext: {
          objectId,
          objectType,
          objectTypeAlias,
          objectTypeMeta,
          anchorElement,
          publicAPIEnabled,
          allowShortUrl,
          sharingData,
          shareableUrl,
          shareableUrlLocatorParams,
          isDirty,
          shareMenuItems: menuItems,
          onClose: () => {
            onClose();
            unmount();
          },
          onSave,
        },
      }),
      rendering
    );

    const openModal = () => {
      unmount = mount(this.container);
      this.isOpen = true;
    };

    if (anchorElement) {
      // @ts-ignore openModal() returns void
      anchorElement.onclick!(openModal());
    } else {
      openModal();
    }
  }
}

export type ShareMenuManagerStart = ReturnType<ShareMenuManager['start']>;
