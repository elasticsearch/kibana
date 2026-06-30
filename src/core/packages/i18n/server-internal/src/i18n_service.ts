/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';
import {
  i18n,
  i18nLoader,
  getLocaleLabel,
  createScopedTranslator,
  type AvailableLocale,
  type ScopedTranslator,
  type TranslationInput,
} from '@kbn/i18n';
import type { Logger } from '@kbn/logging';
import type { IConfigService } from '@kbn/config';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type { KibanaRequest } from '@kbn/core-http-server';
import type {
  InternalHttpServicePreboot,
  InternalHttpServiceSetup,
} from '@kbn/core-http-server-internal';
import type { I18nServiceSetup, I18nServiceStart, RequestI18nClient } from '@kbn/core-i18n-server';
import type { InternalUserSettingsServiceSetup } from '@kbn/core-user-settings-server-internal';
import type { I18nConfigType } from './i18n_config';
import { config as i18nConfigDef } from './i18n_config';
import {
  getAllKibanaTranslationFiles,
  computeLocaleFileHash,
  groupFilesByLocale,
} from './get_kibana_translation_files';
import { initTranslations } from './init_translations';
import { registerRoutes } from './routes';
import { resolveLocale } from './resolve_locale';

export interface PrebootDeps {
  http: InternalHttpServicePreboot;
  pluginPaths: string[];
}

export interface SetupDeps {
  http: InternalHttpServiceSetup;
  pluginPaths: string[];
}

export interface StartDeps {
  userSettings: InternalUserSettingsServiceSetup;
}

interface LocaleResolutionConfig {
  defaultLocale: string;
  locales: readonly string[];
  translationHashes: Record<string, string>;
  allowLocaleCookie: boolean;
}

export interface InternalI18nServicePreboot {
  getTranslationHash(): string;
  getTranslationHashes(): Record<string, string>;
  getAvailableLocales(): ReadonlyArray<AvailableLocale>;
  allowLocaleCookie: boolean;
}

export class I18nService {
  private readonly log: Logger;
  private readonly configService: IConfigService;
  private localeResolutionConfig?: LocaleResolutionConfig;
  private readonly translatorCache = new Map<string, ScopedTranslator>();

  constructor(private readonly coreContext: CoreContext) {
    this.log = coreContext.logger.get('i18n');
    this.configService = coreContext.configService;
  }

  public async preboot({ pluginPaths, http }: PrebootDeps): Promise<InternalI18nServicePreboot> {
    const {
      defaultLocale,
      availableLocales,
      translationHash,
      translationHashes,
      localeFileMap,
      allowLocaleCookie,
    } = await this.initTranslations(pluginPaths);
    const { dist: isDist } = this.coreContext.env.packageInfo;
    http.registerRoutes('', (router) =>
      registerRoutes({
        router,
        locale: defaultLocale,
        isDist,
        translationHashes,
        localeFileMap,
      })
    );

    return {
      getTranslationHash: () => translationHash,
      getTranslationHashes: () => translationHashes,
      getAvailableLocales: () => availableLocales,
      allowLocaleCookie,
    };
  }

  public async setup({ pluginPaths, http }: SetupDeps): Promise<I18nServiceSetup> {
    const {
      defaultLocale,
      locales,
      availableLocales,
      translationFiles,
      translationHash,
      translationHashes,
      localeFileMap,
      allowLocaleCookie,
    } = await this.initTranslations(pluginPaths);

    const router = http.createRouter('');
    const { dist: isDist } = this.coreContext.env.packageInfo;
    registerRoutes({
      router,
      locale: defaultLocale,
      isDist,
      translationHashes,
      localeFileMap,
    });

    // Capture the inputs `start` needs to resolve a locale per request.
    this.localeResolutionConfig = {
      defaultLocale,
      locales,
      translationHashes,
      allowLocaleCookie,
    };

    return {
      getLocale: () => defaultLocale,
      getLocales: () => locales,
      getAvailableLocales: () => availableLocales,
      getTranslationFiles: () => translationFiles,
      getTranslationHash: () => translationHash,
      getTranslationHashes: () => translationHashes,
      allowLocaleCookie,
    };
  }

  public start({ userSettings }: StartDeps): I18nServiceStart {
    const localeConfig = this.localeResolutionConfig;
    if (!localeConfig) {
      throw new Error('I18nService#start called before #setup');
    }

    const isServerless = this.coreContext.env.packageInfo.buildFlavor === 'serverless';

    return {
      asScopedToRequest: (request: KibanaRequest): RequestI18nClient => {
        // Resolve the locale and its translator at most once per request; the
        // first call pays the async profile lookup, the rest reuse the result.
        let resolved: Promise<{ locale: string; translator: ScopedTranslator }> | undefined;
        const resolve = () => {
          if (!resolved) {
            resolved = (async () => {
              const userSettingLocale = await userSettings.getUserSettingLocale(request);
              const { locale } = resolveLocale({
                request,
                userSettingLocale,
                configLocale: localeConfig.defaultLocale,
                configuredLocales: localeConfig.locales,
                translationHashes: localeConfig.translationHashes,
                isServerless,
                allowLocaleCookie: localeConfig.allowLocaleCookie,
              });
              const translator = await this.getTranslator(locale, localeConfig.defaultLocale);
              return { locale, translator };
            })();
          }
          return resolved;
        };

        return {
          getLocale: async () => (await resolve()).locale,
          translate: async (id, args) => (await resolve()).translator.translate(id, args),
          formatList: async (type, value) => (await resolve()).translator.formatList(type, value),
        };
      },
    };
  }

  private async getTranslator(locale: string, defaultLocale: string): Promise<ScopedTranslator> {
    const cached = this.translatorCache.get(locale);
    if (cached) {
      return cached;
    }

    // Default locale reuses the singleton's boot-loaded messages; other locales
    // load from disk via the loader's internal file cache.
    const translationInput: TranslationInput =
      locale === defaultLocale
        ? extractSingletonTranslation()
        : await i18nLoader.getTranslationsByLocale(locale);

    const translator = createScopedTranslator(translationInput);
    this.translatorCache.set(locale, translator);
    return translator;
  }

  private async initTranslations(pluginPaths: string[]) {
    const i18nConfig = await firstValueFrom(
      this.configService.atPath<I18nConfigType>(i18nConfigDef.path)
    );

    const { defaultLocale, locales } = i18nConfig;
    this.log.debug(`Using defaultLocale: ${defaultLocale}, locales: [${locales.join(', ')}]`);

    // Register translation files for all configured locales upfront.
    const allTranslationFiles = await getAllKibanaTranslationFiles(pluginPaths, locales);

    this.log.debug(`Using translation files: [${allTranslationFiles.join(', ')}]`);
    await initTranslations(defaultLocale, allTranslationFiles);

    // Group files by locale so the route handler can locate them for on-demand serving.
    const localeFileMap = groupFilesByLocale(allTranslationFiles);

    // Compute hashes for cache-busted translation URLs. The default locale is already
    // in memory from initTranslations(); non-default locales are hashed from raw file
    // bytes only — no JSON parsing, nothing retained in the loader cache.
    const translationHashes: Record<string, string> = {};
    translationHashes[defaultLocale] = computeHash(JSON.stringify(i18n.getTranslation()));
    for (const locale of locales) {
      if (locale === defaultLocale) continue;
      translationHashes[locale] = await computeLocaleFileHash(localeFileMap[locale] ?? []);
    }

    const translationHash = translationHashes[defaultLocale];

    const availableLocales: AvailableLocale[] = locales.map((id) => ({
      id,
      label: getLocaleLabel(id),
    }));

    return {
      defaultLocale,
      locales,
      availableLocales,
      translationFiles: allTranslationFiles,
      translationHash,
      translationHashes,
      localeFileMap,
      allowLocaleCookie: i18nConfig.allowLocaleCookie,
    };
  }
}

const computeHash = (serialized: string) => {
  return createHash('sha256').update(serialized).digest('hex').slice(0, 12);
};

// Reuse the singleton's boot-loaded default-locale messages, avoiding a
// redundant disk read / JSON parse via the loader.
const extractSingletonTranslation = (): TranslationInput => {
  const { messages, locale, formats } = i18n.getTranslation();
  return { messages, locale, formats };
};
