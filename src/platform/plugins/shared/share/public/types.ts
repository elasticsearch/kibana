/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentType, ReactNode } from 'react';
import type { InjectedIntl } from '@kbn/i18n-react';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { type EuiCodeProps, type EuiIconProps, type EuiFlyoutProps } from '@elastic/eui';
import type { EuiContextMenuPanelItemDescriptorEntry } from '@elastic/eui/src/components/context_menu/context_menu';
import type { ILicense } from '@kbn/licensing-types';
import type { Capabilities } from '@kbn/core/public';
import type { TimeRange } from '@kbn/es-query';
import type { SerializableRecord } from '@kbn/utility-types';
import type { UrlService, LocatorPublic } from '../common/url_service';
import type { BrowserShortUrlClientFactoryCreateParams } from './url_service/short_urls/short_url_client_factory';
import type { BrowserShortUrlClient } from './url_service/short_urls/short_url_client';
import type { AnonymousAccessServiceContract } from '../common/anonymous_access';
import type { DraftModeCalloutProps } from './components/common/draft_mode_callout';

export interface ShareRegistryApiStart {
  capabilities: Capabilities;
  urlService: BrowserUrlService;
  anonymousAccessServiceProvider?: () => AnonymousAccessServiceContract;
  getLicense: () => ILicense | undefined;
}

export type ShareActionConfigArgs<S extends SharingData = SharingData> = ShareContext<S> &
  Pick<ShareRegistryApiStart, 'anonymousAccessServiceProvider' | 'urlService'>;

export type ShareTypes = 'link' | 'embed' | 'legacy' | 'integration';

export type InternalShareActionIntent = Exclude<ShareTypes, 'integration' | 'legacy'>;

type ShareActionUserInputBase<E extends Record<string, unknown> = Record<string, unknown>> = {
  /**
   * The draft mode callout content to be shown when there are unsaved changes.
   * - `true`: Shows the default callout.
   * - `false` or `undefined`: Shows no callout.
   * - `DraftModeCalloutProps`:
   *   - `message`: callout message custom content
   */

  draftModeCallOut?: boolean | DraftModeCalloutProps;
  helpText?: ReactNode;
  CTAButtonConfig?: {
    id: string;
    dataTestSubj: string;
    label: string;
  };
  disabled?: boolean;
} & E;

export interface ShareMenuProviderLegacy {
  readonly id: string;
  getShareMenuItemsLegacy: (context: ShareContext) => ShareMenuItemLegacy[];
}

type ShareImplementationFactory<
  T extends Omit<ShareTypes, 'legacy'>,
  C extends Record<string, unknown> = Record<string, unknown>,
  S extends SharingData = SharingData
> = T extends 'integration'
  ? {
      id: string;
      groupId?: string;
      shareType: T;
      /**
       * Callback that yields the configured methods for the current share implementation as a promise, enables the possibility to dynamically fetch the share configuration
       */
      config: (ctx: ShareActionConfigArgs<S>) => Promise<C>;
      /**
       * When provided, this method will be used to evaluate if this integration should be available,
       * given the current license and capabilities of kibana
       */
      prerequisiteCheck?: (args: {
        capabilities: Capabilities;
        objectType: ShareContext['objectType'];
        license?: ILicense;
      }) => boolean;
    }
  : {
      shareType: T;
      config: (ctx: ShareActionConfigArgs<S>) => C | null;
    };

// Type definition to resolve the configured share implementation methods from the implementation factory
type ShareImplementation<T> = Omit<T, 'config'> & {
  config: T extends ShareImplementationFactory<ShareTypes, infer R> ? R : never;
};

/**
 * @description implementation definition for creating a share action for sharing object links
 */
export type LinkShare = ShareImplementationFactory<
  'link',
  {
    shortUrlService: ReturnType<BrowserUrlService['shortUrls']['get']>;
  }
>;

/**
 * @description Implementation definition for creating a share action for sharing embed links
 */
export type EmbedShare = ShareImplementationFactory<
  'embed',
  {
    anonymousAccess: AnonymousAccessServiceContract;
    shortUrlService: ReturnType<BrowserUrlService['shortUrls']['get']>;
  }
>;

/**
 * @description Skeleton definition for implementing a share action integration
 */
export type ShareIntegration<
  IntegrationParameters extends Record<string, unknown> = Record<string, unknown>,
  S extends SharingData = SharingData
> = ShareImplementationFactory<'integration', IntegrationParameters, S>;

/**
 * @description Implementation definition to support legacy share implementation
 */
export interface ShareLegacy {
  shareType: 'legacy';
  id: ShareMenuProviderLegacy['id'];
  config: ShareMenuProviderLegacy['getShareMenuItemsLegacy'];
}

/**
 * @description Share integration implementation definition for performing exports within kibana
 */
export interface ExportShare<S extends SharingData = SharingData>
  extends ShareIntegration<
    {
      /**
       * @deprecated only kept around for legacy reasons
       */
      name?: string;
      icon?: EuiIconProps['type'];
      sortOrder?: number;
      /**
       * @deprecated only kept around for legacy reasons
       */
      toolTipContent?: string;
      label: string;
      exportType: string;
      /**
       * allows disabling the export action, for instance the current app has no data to export
       */
      disabled?: boolean;
      helpText?: ReactNode;
      generateExportButtonLabel?: ReactNode;
      generateAssetExport: (args: ExportGenerationOpts) => Promise<unknown>;
      renderCopyURIButton?: boolean;
      warnings?: Array<{ title: string; message: string }>;
      requiresSavedState?: boolean;
      supportedLayoutOptions?: Array<'print'>;
      renderLayoutOptionSwitch?: boolean;
      /**
       * indicates if the export integration supports generating it exports with absolute time ranges
       */
      supportsAbsoluteTime?: boolean;
      renderTotalHitsSizeWarning?: (totalHits?: number) => ReactNode | undefined;
      flyoutAriaLabel?: string;
    } & (
      | {
          generateAssetComponent?: never;
          copyAssetURIConfig: {
            headingText: string;
            helpText?: string;
            contentType: EuiCodeProps['language'];
            generateAssetURIValue: (args: ExportGenerationOpts) => string | undefined;
          };
        }
      | { generateAssetComponent: ReactNode; copyAssetURIConfig?: never }
      | {
          generateAssetComponent?: never;
          copyAssetURIConfig?: never;
        }
    ),
    S
  > {
  groupId: 'export';
}

export interface ExportShareParameters extends Record<string, unknown> {
  label: React.FC<{ openFlyout: () => void }>;
  toolTipContent?: ReactNode;
  flyoutContent: React.FC<{
    closeFlyout: () => void;
    flyoutRef: React.RefObject<HTMLDivElement>;
  }>;
  flyoutSizing?: Pick<EuiFlyoutProps, 'size' | 'maxWidth'>;
  flyoutAriaLabel?: string;
  shouldRender: ({
    availableExportItems,
  }: {
    availableExportItems: ExportShareConfig[];
  }) => boolean;
}

/**
 * @description Share integration implementation definition that build off exports within kibana,
 * reach out to the shared ux team before settling on using this interface
 */
export interface ExportShareDerivatives extends ShareIntegration<ExportShareParameters> {
  groupId: 'exportDerivatives';
}

export type ShareActionIntents = LinkShare | EmbedShare | ShareLegacy | ShareIntegration;

export type LinkShareConfig = ShareImplementation<LinkShare>;
export type EmbedShareConfig = ShareImplementation<EmbedShare>;
export type ExportShareConfig = ShareImplementation<ExportShare>;
export type ExportShareDerivativesConfig = ShareImplementation<ExportShareDerivatives>;
export type ShareIntegrationConfig = ShareImplementation<ShareIntegration>;

export type LegacyIntegrationConfig = Omit<ShareLegacy, 'config'> & {
  config: ReturnType<ShareLegacy['config']>;
};

export type ShareConfigs =
  | LinkShareConfig
  | EmbedShareConfig
  | ShareIntegrationConfig
  | ExportShareConfig
  | ExportShareDerivativesConfig
  | LegacyIntegrationConfig;

export type LinkShareUIConfig = ShareActionUserInputBase<{
  /**
   *
   * @description allows a consumer to provide a custom method which when invoked
   * handles providing a share url in the context of said consumer
   */
  delegatedShareUrlHandler?: () => Promise<string>;
}>;

export type EmbedShareUIConfig = ShareActionUserInputBase<{
  embedUrlParamExtensions?: UrlParamExtension[];
  computeAnonymousCapabilities?: (anonymousUserCapabilities: Capabilities) => boolean;
  /**
   * @deprecated use computeAnonymousCapabilities defined on objectTypeMeta config
   */
  showPublicUrlSwitch?: (anonymousUserCapabilities: Capabilities) => boolean;
}>;

/**
 * @description record of user config for each registered export integration
 */
type ExportShareUIConfig = Record<string, ShareActionUserInputBase<{}>>;

export interface ShareUIConfig {
  link: LinkShareUIConfig;
  embed: EmbedShareUIConfig;
  integration: {
    [key: string]: ShareActionUserInputBase;
    export: ExportShareUIConfig;
  };
}

/**
 * One locator (typical link/export flows) or several (e.g. CSV reporting).
 */
export type SharingDataLocatorParams<P extends SerializableRecord = SerializableRecord> =
  | {
      id: string;
      params: P;
      version?: string;
    }
  | Array<{
      id: string;
      params: P;
      version?: string;
    }>;

export interface SharingData<P extends SerializableRecord = SerializableRecord>
  extends Record<string, unknown> {
  title: string;
  locatorParams: SharingDataLocatorParams<P>;
}

export type ShareIntegrationMapKey = `integration-${string}`;

/**
 * Registration payload for a share integration.
 * We infer sharing-data `S` from `I` instead of constraining `I extends ShareIntegration` (defaults on
 * `ShareIntegration` use `SharingData`, and `config`'s `ctx` is contravariant in `S`, so
 * `ExportShare<ReportingCSVSharingData>` is not assignable to the default `ShareIntegration`).
 */
export type RegisterShareIntegrationArgs<I = ShareIntegration> = I extends ShareIntegration<
  infer P,
  infer S
>
  ? P extends Record<string, unknown>
    ? S extends SharingData
      ? Pick<I, 'id' | 'groupId' | 'prerequisiteCheck'> & {
          getShareIntegrationConfig: (ctx: ShareActionConfigArgs<S>) => ReturnType<I['config']>;
        }
      : never
    : never
  : never;

export interface ShareRegistryInternalApi {
  registerShareIntegration<I>(shareObject: string, arg: RegisterShareIntegrationArgs<I>): void;
  registerShareIntegration<I>(arg: RegisterShareIntegrationArgs<I>): void;

  resolveShareItemsForShareContext<S extends SharingData = SharingData>(
    args: ShareContext<S> & { isServerless: boolean }
  ): Promise<ShareConfigs[]>;
}

export abstract class ShareRegistryPublicApi {
  abstract setup(): {
    /**
     * @description registers a share menu provider for a specific object type
     */
    registerShareIntegration: ShareRegistryInternalApi['registerShareIntegration'];
  };

  abstract start(args: ShareRegistryApiStart): {
    resolveShareItemsForShareContext: ShareRegistryInternalApi['resolveShareItemsForShareContext'];
  };
}

export type BrowserUrlService = UrlService<
  BrowserShortUrlClientFactoryCreateParams,
  BrowserShortUrlClient
>;

export type ShareableLocatorParams = SerializableRecord & {
  timeRange: TimeRange | undefined;
};

/**
 * @public
 * Properties of the current object to share. Registered share
 * menu providers will provide suitable items which have to
 * be rendered in an appropriate place by the caller.
 *
 * It is possible to use the static function `toggleShareContextMenu`
 * to render the menu as a popover.
 * */
export interface ShareContext<S extends SharingData = SharingData> {
  /**
   * The type of the object to share. for example lens, dashboard, etc.
   */
  objectType: string;
  /**
   * An alias of type of the object to share, that's more human friendly.
   */
  objectTypeAlias?: string;
  /**
   * Allows for passing contextual information that each consumer can provide to customize the share menu
   */
  objectTypeMeta: {
    title: string;
    config: Partial<{
      [T in Exclude<ShareTypes, 'legacy'>]: ShareUIConfig[T];
    }>;
  };
  /**
   * Id of the object that's been attempted to be shared
   */
  objectId?: string;
  /**
   * Current url for sharing. This can be set in cases where `window.location.href`
   * does not contain a shareable URL (e.g. if using session storage to store the current
   * app state is enabled). In these cases the property should contain the URL in a
   * format which makes it possible to use it without having access to any other state
   * like the current session.
   *
   * If not set it will default to `window.location.href`
   */
  shareableUrl?: string;
  /**
   * @deprecated prefer {@link delegatedShareUrlHandler}
   */
  shareableUrlForSavedObject?: string;
  shareableUrlLocatorParams?: {
    locator: LocatorPublic<SerializableRecord>;
    params: ShareableLocatorParams;
  };
  sharingData: S;
  isDirty: boolean;
  onClose: () => void;
}

/**
 * @public
 * Eui context menu entry shown directly in the context menu. `sortOrder` is
 * used to order the individual items in a flat list returned by all registered
 * menu providers.
 * */
export interface ShareContextMenuPanelItem
  extends Omit<EuiContextMenuPanelItemDescriptorEntry, 'name'> {
  name: string; // EUI will accept a `ReactNode` for the `name` prop, but `ShareContentMenu` assumes a `string`.
  sortOrder?: number;
}

/**
 * @public
 * Definition of a menu item rendered in the share menu. In the redesign, the
 * `shareMenuItem` is shown in a modal. However, Canvas
 * uses the legacy panel implementation.
 * */

interface ShareMenuItemBase {
  shareMenuItem?: ShareContextMenuPanelItem;
}

export interface ShareMenuItemLegacy extends ShareMenuItemBase {
  panel?: EuiContextMenuPanelDescriptor;
}

export interface ExportGenerationOpts {
  optimizedForPrinting?: boolean;
  intl: InjectedIntl;
}

interface UrlParamExtensionProps {
  setParamValue: (values: {}) => void;
}

export interface UrlParamExtension {
  paramName: string;
  component: ComponentType<UrlParamExtensionProps>;
}

/** @public */
export interface ShowShareMenuOptions<
  /**
   * Specifies the type of the locator params for the sharing data.
   */
  P extends SerializableRecord = SerializableRecord,
  /**
   * Specifies the type of the sharing data.
   */
  S extends Record<string, unknown> = Record<string, unknown>
> extends Omit<ShareContext<SharingData<P> & S>, 'onClose'> {
  asExport?: boolean;
  anchorElement?: HTMLElement;
  allowShortUrl: boolean;
  onClose?: () => void;
  publicAPIEnabled?: boolean;
  onSave?: () => Promise<void>;
}

export interface ClientConfigType {
  new_version: { enabled: boolean };
}
