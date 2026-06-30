/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * @jest-environment jsdom
 */

import { getBrowserPreferredLocale } from './locales';

describe('getBrowserPreferredLocale', () => {
  const available = [{ id: 'en' }, { id: 'fr-FR' }, { id: 'ja-JP' }];

  const setLanguages = (languages: string[]) => {
    Object.defineProperty(window.navigator, 'languages', {
      value: languages,
      configurable: true,
    });
  };

  it('returns the highest-priority browser language that maps to an available locale', () => {
    setLanguages(['fr-FR', 'en']);
    expect(getBrowserPreferredLocale(available)).toBe('fr-FR');
  });

  it('matches case-insensitively and returns the canonical available id', () => {
    setLanguages(['FR-fr']);
    expect(getBrowserPreferredLocale(available)).toBe('fr-FR');
  });

  it('skips browser languages that cannot be served and falls through to the next', () => {
    setLanguages(['es-ES', 'ja-JP']);
    expect(getBrowserPreferredLocale(available)).toBe('ja-JP');
  });

  it('falls back to the primary language subtag when there is no exact match', () => {
    // The browser reports only `en-US` (no bare `en`); it should still resolve
    // to the available `en` via primary-subtag fallback.
    setLanguages(['en-US']);
    expect(getBrowserPreferredLocale(available)).toBe('en');
  });

  it('prefers an exact match over a primary-subtag fallback', () => {
    // `fr-FR` is available exactly, so a `fr-FR` preference takes it directly
    // rather than falling back to some other `fr-*` locale.
    setLanguages(['fr-FR']);
    expect(getBrowserPreferredLocale(available)).toBe('fr-FR');
  });

  it('returns undefined when no browser language can be served', () => {
    setLanguages(['es-ES', 'pt-BR']);
    expect(getBrowserPreferredLocale(available)).toBeUndefined();
  });

  it('falls back to navigator.language when navigator.languages is empty', () => {
    setLanguages([]);
    Object.defineProperty(window.navigator, 'language', { value: 'en', configurable: true });
    expect(getBrowserPreferredLocale(available)).toBe('en');
  });
});
