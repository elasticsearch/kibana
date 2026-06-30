/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const KNOWN_LOCALE_IDS = ['en', 'fr-FR', 'ja-JP', 'zh-CN', 'de-DE'] as const;

const KNOWN_LOCALE_LIST: ReadonlyArray<{ id: string }> = KNOWN_LOCALE_IDS.map((id) => ({ id }));

/**
 * A supported locale code (e.g., `"en"`, `"fr-FR"`). Widened to `string` so
 * deployments can configure additional locales via `kibana.yml` (`i18n.locales`)
 * — for instance, plugins shipping their own translation files.
 */
export type SupportedLocaleId = string;

/**
 * Default list of locale ids Kibana ships translations for. Used as the
 * default value of `i18n.locales` in the config schema and as a fallback
 * when there is no runtime configuration available (e.g., test fixtures,
 * Storybook). It is **not** an authoritative runtime allow-list — admins
 * can curate or extend the list via `kibana.yml`.
 */
export const SUPPORTED_LOCALE_IDS: readonly string[] = KNOWN_LOCALE_IDS;

/**
 * Returns the friendly label for a locale id, using `Intl.DisplayNames`
 * in the **endonym** pattern: each locale is rendered in its own
 * language (`fr-FR` → `"français"`, `ja-JP` → `"日本語"`). This means a
 * user stuck in a language they cannot read still sees their preferred
 * language listed in a script they recognise.
 *
 * Region is dropped before lookup so the label is the bare language
 * name, following each language's own orthographic conventions (French
 * does not capitalise language names; English and German do).
 *
 * Falls back to the locale id when `Intl.DisplayNames` is unavailable
 * (e.g., minimal-ICU Node builds) or cannot resolve the locale.
 */
export const getLocaleLabel = (id: SupportedLocaleId): string => {
  try {
    const baseLanguage = id.split('-')[0];
    return new Intl.DisplayNames([id], { type: 'language' }).of(baseLanguage) ?? id;
  } catch {
    return id;
  }
};

/**
 * Returns the canonical-casing locale id matching the given locale string
 * against the supplied list (or the bundled known-locale list when no
 * list is provided), or `"en"` if no match is found. The i18n engine
 * lowercases locales internally (so `fr-FR` becomes `fr-fr`), but UI
 * options and persistence expect canonical casing (`fr-FR`).
 */
export const toCanonicalLocaleId = (
  locale: string,
  availableLocales: ReadonlyArray<{ id: string }> = KNOWN_LOCALE_LIST
): SupportedLocaleId => {
  const lc = locale.toLowerCase();
  return availableLocales.find(({ id }) => id.toLowerCase() === lc)?.id ?? 'en';
};

/**
 * A locale that the running Kibana instance offers in the language picker.
 */
export interface AvailableLocale {
  id: SupportedLocaleId;
  label: string;
}

let _availableLocales: ReadonlyArray<AvailableLocale> = [];

/**
 * Sets the list of locales the current Kibana instance offers in the
 * language picker. Called once during browser bootstrap with the values
 * the server derived from `i18n.locales`. An empty list means the picker
 * UI is disabled for this deployment.
 */
export const setAvailableLocales = (locales: ReadonlyArray<AvailableLocale>): void => {
  _availableLocales = locales.map(({ id, label }) => ({ id, label }));
};

/**
 * Returns the list of locales the current Kibana instance offers in the
 * language picker. Returns an empty array if `setAvailableLocales` has not
 * been called or if the deployment has disabled the picker.
 */
export const getAvailableLocales = (): ReadonlyArray<AvailableLocale> => _availableLocales;

/**
 * Resolves the browser's most-preferred language to a locale id this Kibana
 * instance can serve. For each entry in `navigator.languages` (highest priority
 * first) we try a case-insensitive exact match against the available locales,
 * then fall back to the primary language subtag — so `en-US` resolves to `en`
 * when the browser does not also list a bare `en`. Returns `undefined` when no
 * browser preference can be served, or when called outside a browser (e.g. on
 * the server).
 */
export const getBrowserPreferredLocale = (
  availableLocales: ReadonlyArray<{ id: string }> = getAvailableLocales()
): SupportedLocaleId | undefined => {
  if (typeof navigator === 'undefined') return undefined;

  const preferences = navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean);

  const primarySubtag = (tag: string) => tag.split('-')[0].toLowerCase();

  for (const preference of preferences) {
    const lower = preference.toLowerCase();
    const exact = availableLocales.find(({ id }) => id.toLowerCase() === lower);
    if (exact) return exact.id;

    const primary = primarySubtag(preference);
    const byPrimary = availableLocales.find(({ id }) => primarySubtag(id) === primary);
    if (byPrimary) return byPrimary.id;
  }
  return undefined;
};
