/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BehaviorSubject, firstValueFrom, of, map, catchError, take, timeout } from 'rxjs';
import { i18n as i18nLib, EN_LOCALE } from '@kbn/i18n';
import type { ThemeVersion } from '@kbn/ui-shared-deps-npm';

import type { Logger } from '@kbn/logging';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type { KibanaRequest, HttpAuth } from '@kbn/core-http-server';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-server';
import type { UiPlugins } from '@kbn/core-plugins-base-server-internal';
import type { CustomBranding } from '@kbn/core-custom-branding-common';
import type { UserStorageServiceStart } from '@kbn/core-user-storage-server';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import {
  type DarkModeValue,
  type ThemeName,
  parseDarkModeValue,
  parseThemeNameValue,
  type UiSettingsParams,
  type UserProvidedValues,
  DEFAULT_THEME_NAME,
} from '@kbn/core-ui-settings-common';
import { Template } from './views';
import type {
  IRenderOptions,
  RenderingPrebootDeps,
  RenderingSetupDeps,
  InternalRenderingServicePreboot,
  InternalRenderingServiceSetup,
  RenderingMetadata,
  RenderingStartDeps,
} from './types';
import { registerBootstrapRoute, bootstrapRendererFactory, isRspackModeEnabled } from './bootstrap';
import {
  getSettingValue,
  getCommonStylesheetPaths,
  getThemeStylesheetPaths,
  getScriptPaths,
  getBrowserLoggingConfig,
} from './render_utils';
import { resolveLocale } from './resolve_locale';
import { filterUiPlugins } from './filter_ui_plugins';
import { getApmConfig } from './get_apm_config';
import type { InternalRenderingRequestHandlerContext } from './internal_types';
import { isThemeBundled } from './theme';

type RenderOptions =
  | RenderingSetupDeps
  | (RenderingPrebootDeps & {
      status?: never;
      elasticsearch?: never;
      featureFlags?: never;
      customBranding?: never;
      userSettings?: never;
    });

const themeVersion: ThemeVersion = 'v8';

// TODO: Remove the temporary feature flag and supporting code when Borealis is live in Serverless
// https://github.com/elastic/eui-private/issues/192
export const DEFAULT_THEME_NAME_FEATURE_FLAG = 'coreRendering.defaultThemeName';

/** @internal */
export class RenderingService {
  private readonly themeName$ = new BehaviorSubject<ThemeName>(DEFAULT_THEME_NAME);
  private readonly logger: Logger;
  private airgapped: boolean = false;
  private isCoreRenderingInReactConcurrentMode: boolean = true;
  private userStorageStart?: UserStorageServiceStart;
  constructor(private readonly coreContext: CoreContext) {
    this.logger = coreContext.logger.get('rendering');
  }

  public async preboot({
    http,
    uiPlugins,
    i18n,
  }: RenderingPrebootDeps): Promise<InternalRenderingServicePreboot> {
    http.registerRoutes<InternalRenderingRequestHandlerContext>('', (router) => {
      registerBootstrapRoute({
        router,
        renderer: bootstrapRendererFactory({
          uiPlugins,
          baseHref: http.staticAssets.getHrefBase(),
          packageInfo: this.coreContext.env.packageInfo,
          auth: http.auth,
          themeName$: this.themeName$,
        }),
      });
    });

    return {
      render: this.render.bind(this, { http, uiPlugins, i18n }),
    };
  }

  public async setup({
    elasticsearch,
    featureFlags,
    http,
    status,
    uiPlugins,
    customBranding,
    userSettings,
    i18n,
  }: RenderingSetupDeps): Promise<InternalRenderingServiceSetup> {
    this.airgapped = await firstValueFrom(
      this.coreContext.configService.atPath<boolean>('airgapped')
    ).catch(() => false);

    this.isCoreRenderingInReactConcurrentMode = await firstValueFrom(
      this.coreContext.configService.atPath<boolean>('isCoreRenderingInReactConcurrentMode')
    ).catch(() => true);

    registerBootstrapRoute({
      router: http.createRouter<InternalRenderingRequestHandlerContext>(''),
      renderer: bootstrapRendererFactory({
        uiPlugins,
        baseHref: http.staticAssets.getHrefBase(),
        packageInfo: this.coreContext.env.packageInfo,
        auth: http.auth,
        themeName$: this.themeName$,
        userSettingsService: userSettings,
      }),
    });

    return {
      render: this.render.bind(this, {
        elasticsearch,
        featureFlags,
        http,
        uiPlugins,
        status,
        customBranding,
        userSettings,
        i18n,
      }),
    };
  }

  public start({ featureFlags, userStorage }: RenderingStartDeps) {
    this.userStorageStart = userStorage;
    featureFlags
      .getStringValue$<ThemeName>(DEFAULT_THEME_NAME_FEATURE_FLAG, DEFAULT_THEME_NAME)
      // Parse the input feature flag value to ensure it's of type ThemeName
      // and that it's bundled with this build of Kibana
      .pipe(
        map((themeName) => {
          if (isThemeBundled(themeName)) {
            return parseThemeNameValue(themeName);
          }

          return DEFAULT_THEME_NAME;
        })
      )
      .subscribe(this.themeName$);
  }

  private async render(
    renderOptions: RenderOptions,
    request: KibanaRequest,
    uiSettings: {
      client: IUiSettingsClient;
      globalClient: IUiSettingsClient;
    },
    { isAnonymousPage = false, includeExposedConfigKeys }: IRenderOptions = {}
  ) {
    const {
      elasticsearch,
      featureFlags,
      http,
      uiPlugins,
      status,
      customBranding,
      userSettings,
      i18n,
    } = renderOptions;

    const env = {
      mode: this.coreContext.env.mode,
      packageInfo: this.coreContext.env.packageInfo,
      airgapped: this.airgapped,
      isCoreRenderingInReactConcurrentMode: this.isCoreRenderingInReactConcurrentMode,
    };
    const staticAssetsHrefBase = http.staticAssets.getHrefBase();
    const usingCdn = http.staticAssets.isUsingCdn();
    const basePath = http.basePath.get(request);
    const { serverBasePath, publicBaseUrl } = http.basePath;

    // Grouping all async HTTP requests to run them concurrently for performance reasons.
    // Anonymous pages skip user-scoped values and async default values (the latter typically
    // call ES via `asCurrentUser`, which would 401 on an unauthenticated request).
    const [
      defaultSettings,
      settingsUserValues = {},
      globalSettingsUserValues = {},
      userSettingDarkMode,
      userSettingLocale,
      userStorageValues = {},
    ] = await Promise.all(
      isAnonymousPage
        ? [uiSettings.client?.getRegistered() ?? {}]
        : ([
            withAsyncDefaultValues(request, uiSettings.client?.getRegistered()),
            uiSettings.client?.getUserProvided(true),
            uiSettings.globalClient?.getUserProvided(true),
            // dark mode
            userSettings?.getUserSettingDarkMode(request),
            // locale
            userSettings?.getUserSettingLocale(request),
            // user storage
            this.fetchUserStorage(request),
          ] as [
            ReturnType<typeof withAsyncDefaultValues>,
            Promise<Record<string, UserProvidedValues>>,
            Promise<Record<string, UserProvidedValues>>,
            Promise<DarkModeValue> | undefined,
            Promise<string> | undefined,
            Promise<Record<string, unknown>>
          ])
    );

    const settings = {
      defaults: defaultSettings,
      user: settingsUserValues,
    };
    const globalSettings = {
      defaults: uiSettings.globalClient?.getRegistered() ?? {},
      user: globalSettingsUserValues,
    };

    let clusterInfo = {};
    let branding: CustomBranding = {};
    try {
      // Only provide the clusterInfo if the request is authenticated and the elasticsearch service is available.
      const authenticated = isAuthenticated(http.auth, request);
      if (authenticated && elasticsearch) {
        clusterInfo = await firstValueFrom(
          elasticsearch.clusterInfo$.pipe(
            timeout(50), // If not available, just return undefined
            catchError(() => of({}))
          )
        );
      }
      branding = await customBranding?.getBrandingFor(request, {
        unauthenticated: !authenticated,
      })!;
    } catch (err) {
      // swallow error
    }

    // dark mode
    const isThemeOverridden = settings.user['theme:darkMode']?.isOverridden ?? false;

    let darkMode: DarkModeValue;
    if (userSettingDarkMode !== undefined && !isThemeOverridden) {
      darkMode = userSettingDarkMode;
    } else {
      darkMode = getSettingValue<DarkModeValue>('theme:darkMode', settings, parseDarkModeValue);
    }

    const themeStylesheetPaths = (mode: boolean) =>
      getThemeStylesheetPaths({
        darkMode: mode,
        baseHref: staticAssetsHrefBase,
      });
    const commonStylesheetPaths = getCommonStylesheetPaths({
      baseHref: staticAssetsHrefBase,
    });
    const themeName = this.themeName$.getValue();

    const scriptPaths = getScriptPaths({
      themeName,
      darkMode,
      baseHref: staticAssetsHrefBase,
    });

    const loggingConfig = await getBrowserLoggingConfig(this.coreContext.configService);

    const configLocale = i18nLib.getLocale();
    const translationHashes = i18n.getTranslationHashes();
    const availableLocales = i18n.getAvailableLocales();
    const isServerless = this.coreContext.env.packageInfo.buildFlavor === 'serverless';
    const { locale: effectiveLocale, setCookieHeader } = resolveLocale({
      request,
      userSettingLocale,
      configLocale,
      configuredLocales: availableLocales.map((entry) => entry.id),
      translationHashes,
      isServerless,
      serverBasePath,
      allowLocaleCookie: i18n.allowLocaleCookie,
    });
    // When the effective locale is English, the browser's pre-allocated `intl`
    // instance is already wired to English (see kbn-i18n module initialisation).
    // Signal null so the browser skips the HTTP fetch and react re-renders.
    let translationsUrl: string | null = null;
    if (effectiveLocale !== EN_LOCALE) {
      if (usingCdn) {
        translationsUrl = `${staticAssetsHrefBase}/translations/${effectiveLocale}.json`;
      } else {
        const translationHash = translationHashes[effectiveLocale] ?? i18n.getTranslationHash();
        translationsUrl = `${serverBasePath}/translations/${translationHash}/${effectiveLocale}.json`;
      }
    }

    const apmConfig = getApmConfig(request.url.pathname);

    const filteredPlugins = filterUiPlugins({ uiPlugins, isAnonymousPage });
    const bootstrapScript = isAnonymousPage ? 'bootstrap-anonymous.js' : 'bootstrap.js';

    const useRspack = isRspackModeEnabled();
    const uiPublicUrl = `${staticAssetsHrefBase}/ui`;

    // Script preloads are intentionally removed for Rspack mode. Under HTTP/1.1
    // (dev mode), <link rel="preload" as="script"> tags saturate the 6-connection
    // limit and delay critical CSS, regressing FCP by ~4x. The bootstrap load()
    // array already ensures all scripts are fetched with "High" priority via
    // dynamic <script async=false> tags, so preloads provide no benefit and
    // actively harm performance.
    //
    // Font preloads are kept: they are small, high-priority, and give the browser
    // a head start on WOFF2 downloads during HTML parsing.
    const preloadFonts = useRspack
      ? [
          `${uiPublicUrl}/fonts/inter/Inter-Regular.woff2`,
          `${uiPublicUrl}/fonts/inter/Inter-Medium.woff2`,
          `${uiPublicUrl}/fonts/inter/Inter-SemiBold.woff2`,
        ]
      : undefined;

    const metadata: RenderingMetadata = {
      strictCsp: http.csp.strict,
      hardenPrototypes: http.prototypeHardening,
      uiPublicUrl,
      bootstrapScriptUrl: `${basePath}/${bootstrapScript}`,
      locale: effectiveLocale,
      themeVersion,
      darkMode,
      stylesheetPaths: commonStylesheetPaths,
      scriptPaths,
      preloadFonts,
      optimizeFontLoading: useRspack || undefined,
      customBranding: {
        faviconSVG: branding?.faviconSVG,
        faviconPNG: branding?.faviconPNG,
        pageTitle: branding?.pageTitle,
        logo: branding?.logo,
      },
      injectedMetadata: {
        version: env.packageInfo.version,
        buildNumber: env.packageInfo.buildNum,
        branch: env.packageInfo.branch,
        basePath,
        serverBasePath,
        spaceId: request.spaceId,
        publicBaseUrl,
        assetsHrefBase: staticAssetsHrefBase,
        logging: loggingConfig,
        env,
        featureFlags: {
          overrides: featureFlags?.getOverrides() || {},
          initialFeatureFlags: (await featureFlags?.getInitialFeatureFlags()) || {},
        },
        clusterInfo,
        apmConfig,
        anonymousStatusPage: status?.isStatusPageAnonymous() ?? false,
        i18n: {
          translationsUrl,
          availableLocales: availableLocales.map(({ id, label }) => ({ id, label })),
        },
        theme: {
          darkMode,
          name: themeName,
          version: themeVersion,
          stylesheetPaths: {
            default: themeStylesheetPaths(false),
            dark: themeStylesheetPaths(true),
          },
        },
        customBranding: {
          logo: branding?.logo,
          customizedLogo: branding?.customizedLogo,
          pageTitle: branding?.pageTitle,
        },
        csp: { warnLegacyBrowsers: http.csp.warnLegacyBrowsers },
        externalUrl: http.externalUrl,
        uiPlugins: await Promise.all(
          filteredPlugins.map(async ([id, plugin]) => {
            const { browserConfig, exposedConfigKeys } = await getUiConfig(uiPlugins, id);
            return {
              id,
              plugin,
              config: browserConfig,
              ...(includeExposedConfigKeys && { exposedConfigKeys }),
            };
          })
        ),
        legacyMetadata: {
          uiSettings: settings,
          globalUiSettings: globalSettings,
        },
        userStorage: { values: userStorageValues },
      },
    };

    const cookieHeaders: Record<string, string> = i18n.allowLocaleCookie
      ? { 'set-cookie': setCookieHeader }
      : {};

    return {
      body: `<!DOCTYPE html>${renderToStaticMarkup(<Template metadata={metadata} />)}`,
      headers: cookieHeaders,
    };
  }

  public async stop() {}

  private async fetchUserStorage(request: KibanaRequest): Promise<Record<string, unknown>> {
    const userStorage = this.userStorageStart;
    if (!userStorage) return {};

    const client = userStorage.asScoped(request);
    if (!client) return {};

    try {
      return await client.getForInjection();
    } catch (err) {
      // Authorization errors are expected for users whose auth realm does not
      // grant access to user-storage saved objects (e.g. certain SAML configs).
      // Degrade gracefully so the page still renders with default values.
      if (
        SavedObjectsErrorHelpers.isForbiddenError(err) ||
        SavedObjectsErrorHelpers.isNotAuthorizedError(err)
      ) {
        this.logger.debug(`User storage preload skipped (not authorized): ${err.message}`);
        return {};
      }

      this.logger.error(`User storage preload failed: ${err.message}`);
      throw err;
    }
  }
}

const getUiConfig = async (uiPlugins: UiPlugins, pluginId: string) => {
  const browserConfig = uiPlugins.browserConfigs.get(pluginId);
  return ((await browserConfig?.pipe(take(1)).toPromise()) ?? {
    browserConfig: {},
    exposedConfigKeys: {},
  }) as { browserConfig: Record<string, unknown>; exposedConfigKeys: Record<string, string> };
};

const isAuthenticated = (auth: HttpAuth, request: KibanaRequest) => {
  const { status: authStatus } = auth.get(request);
  // status is 'unknown' when auth is disabled. we just need to not be `unauthenticated` here.
  return authStatus !== 'unauthenticated';
};

/**
 * Load async values from the definitions that have a `getValue()` function
 *
 * @param defaultSettings The default settings to add async values to
 * @param request The current KibanaRequest
 * @returns The default settings with values updated with async values
 */
const withAsyncDefaultValues = async (
  request: KibanaRequest,
  defaultSettings: Readonly<Record<string, Omit<UiSettingsParams, 'schema'>>> = {}
): Promise<Readonly<Record<string, Omit<UiSettingsParams, 'schema'>>>> => {
  const updatedSettings = { ...defaultSettings };

  await Promise.all(
    Object.entries(defaultSettings)
      .filter(([_, definition]) => typeof definition.getValue === 'function')
      .map(([key, definition]) => {
        return definition.getValue!({ request }).then((value) => {
          updatedSettings[key] = { ...definition, value };
        });
      })
  );

  return updatedSettings;
};
