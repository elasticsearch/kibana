/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type * as i18nModule from './i18n';
import type { Translation, TranslationInput } from '../translation';
import type { Formats } from './formats';
import { defaultEnFormats } from './formats';

const createExpectedTranslations = (
  locale: string,
  overrides: Partial<Translation> = {}
): Translation => {
  return {
    messages: {},
    defaultLocale: 'en',
    defaultFormats: defaultEnFormats,
    formats: {},
    ...overrides,
    locale,
  };
};

// TODO: Unskip with the i18n tooling upgrade.
// Currently skipped due to not throwing on i18n errors inside the error_handler until the tooling is fixed.
describe.skip('I18n engine', () => {
  let i18n: typeof i18nModule;

  beforeEach(() => {
    i18n = jest.requireActual('./i18n');
  });

  afterEach(() => {
    // isolate modules for every test so that local module state doesn't conflict between tests
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('useTranslation', () => {
    test('should throw error if locale is not specified or empty', () => {
      expect(() =>
        // @ts-expect-error
        i18n.activateTranslation({ messages: { foo: 'bar' } })
      ).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] A \`locale\` must be a non-empty string to add messages."`
      );
      expect(() =>
        i18n.activateTranslation({ locale: '', messages: {} })
      ).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] A \`locale\` must be a non-empty string to add messages."`
      );
    });

    test('should add messages if locale prop is passed as messages property', () => {
      const locale = 'ru';

      expect(i18n.getTranslation()).toEqual(createExpectedTranslations('en'));

      i18n.activateTranslation({
        locale,
        messages: {
          foo: 'bar',
        },
      });

      expect(i18n.getTranslation()).toEqual(
        createExpectedTranslations(locale, {
          messages: {
            foo: 'bar',
          },
        })
      );
    });

    test('should override previously set messages on useTranslations', () => {
      const locale = 'ru';

      i18n.activateTranslation({
        locale,
        messages: {
          ['a.b.c']: 'foo',
        },
      });

      expect(i18n.getTranslation()).toEqual(
        createExpectedTranslations(locale, {
          defaultLocale: 'en',
          messages: {
            ['a.b.c']: 'foo',
          },
        })
      );

      i18n.activateTranslation({
        locale,
        messages: {
          ['d.e.f']: 'bar',
        },
      });

      expect(i18n.getTranslation()).toEqual(
        createExpectedTranslations(locale, {
          locale: 'ru',
          messages: {
            ['d.e.f']: 'bar',
          },
        })
      );

      i18n.activateTranslation({
        locale,
        messages: {
          ['d.e.f']: 'baz',
        },
      });

      expect(i18n.getTranslation()).toEqual(
        createExpectedTranslations(locale, {
          locale: 'ru',
          messages: {
            ['d.e.f']: 'baz',
          },
        })
      );
    });

    test('should add messages with normalized passed locale', () => {
      i18n.activateTranslation({
        locale: 'en-US',
        messages: {
          ['a.b.c']: 'bar',
        },
      });

      expect(i18n.getLocale()).toBe('en-us');
      expect(i18n.getTranslation().locale).toEqual('en-us');
    });
  });

  describe('getTranslation', () => {
    test('should return messages for the current language', () => {
      const locale = 'ru';
      i18n.activateTranslation({
        locale,
        messages: {
          foo: 'bar',
        },
      });

      expect(i18n.getTranslation()).toEqual(
        createExpectedTranslations(locale, {
          messages: {
            foo: 'bar',
          },
        })
      );
    });

    test('should return translation defaults if not i18n is not initialized', () => {
      expect(i18n.getTranslation()).toEqual({
        locale: 'en',
        defaultLocale: 'en',
        messages: {},
        defaultFormats: defaultEnFormats,
        formats: {},
      });
    });
  });

  describe('custom formats', () => {
    test('falls back on defaultFormats if formats is falsey or malforms', () => {
      const setFormats = (formats: unknown) =>
        i18n.activateTranslation({
          locale: 'en',
          messages: {},
          // @ts-expect-error
          formats,
        });

      expect(() => setFormats(undefined)).not.toThrow();
      expect(() => setFormats(null)).not.toThrow();
      expect(() => setFormats(true)).not.toThrow();
      expect(() => setFormats(5)).not.toThrow();
      expect(() => setFormats({})).not.toThrow();
      expect(() => setFormats('foo')).not.toThrow();
    });

    test('should set formats to current formats and keep default formats', () => {
      expect(i18n.getTranslation().defaultFormats.date!.short).toEqual({
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
      });
      expect(i18n.getTranslation().formats).toEqual({});

      i18n.activateTranslation({
        locale: 'en',
        messages: {},
        formats: {
          date: {
            short: {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            },
          },
        },
      });

      expect(i18n.getTranslation().formats!.date!.short).toEqual({
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      i18n.activateTranslation({
        locale: 'en',
        messages: {},
        formats: {
          date: {
            short: {
              month: 'long',
            },
          },
        },
      });

      expect(i18n.getTranslation().formats!.date!.short).toEqual({
        month: 'long',
      });

      expect(i18n.getTranslation().defaultFormats.date!.short).toEqual({
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
      });
    });
  });

  describe('formats', () => {
    test('should return "en" formats by default', () => {
      i18n.init({ locale: 'fr', messages: {} });

      expect(i18n.getTranslation().defaultFormats).toEqual(defaultEnFormats);
    });

    test('should return updated formats', () => {
      const customFormats: Formats = {
        number: {
          currency: {
            style: 'currency',
            currency: 'EUR',
          },
        },
      };

      i18n.init({
        locale: 'en',
        messages: {},
        formats: customFormats,
      });
      const { defaultFormats, formats } = i18n.getTranslation();

      expect(defaultFormats).toEqual(defaultEnFormats);
      expect(formats).toEqual(customFormats);
    });
  });

  describe('translate', () => {
    test('should throw error if id is not a non-empty string', () => {
      expect(() => i18n.translate(undefined as any, {} as any)).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] An \`id\` must be a non-empty string to translate a message."`
      );
      expect(() => i18n.translate(null as any, {} as any)).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] An \`id\` must be a non-empty string to translate a message."`
      );
      expect(() => i18n.translate(true as any, {} as any)).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] An \`id\` must be a non-empty string to translate a message."`
      );
      expect(() => i18n.translate(5 as any, {} as any)).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] An \`id\` must be a non-empty string to translate a message."`
      );
      expect(() => i18n.translate({} as any, {} as any)).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] An \`id\` must be a non-empty string to translate a message."`
      );
      expect(() => i18n.translate('', {} as any)).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] An \`id\` must be a non-empty string to translate a message."`
      );
    });

    test('should throw error if translation message and defaultMessage are not provided', () => {
      expect(() => i18n.translate('foo', {} as any)).toThrowErrorMatchingInlineSnapshot(`
        "[I18n] Error formatting the default message for: \\"foo\\".
        Error: Missing \`defaultMessage\`."
      `);

      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: 'foo',
        },
      });

      expect(() => i18n.translate('a.b.c', {} as any)).toThrowErrorMatchingInlineSnapshot(`
        "[I18n] Error formatting the default message for: \\"a.b.c\\".
        Error: Missing \`defaultMessage\`."
      `);
    });

    test('should return default message as is if values are not provided', () => {
      expect(i18n.translate('a.b.c', { defaultMessage: 'foo' })).toBe('foo');
    });

    test('should not return defaultMessage as is if values are provided', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: 'foo',
        },
      });
      expect(i18n.translate('a.b.c', { defaultMessage: 'bar' })).toBe('foo');
    });

    test('should interpolate variables', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: 'foo {a}, {b}, {c} bar',
          ['d.e.f']: '{foo}',
        },
      });

      expect(
        i18n.translate('a.b.c', {
          defaultMessage: 'UNUSED',
          values: { a: 1, b: 2, c: 3 },
        } as any)
      ).toBe('foo 1, 2, 3 bar');

      expect(
        i18n.translate('d.e.f', { defaultMessage: 'UNUSED', values: { foo: 'bar' } } as any)
      ).toBe('bar');
    });

    test('should interpolate variables for default messages', () => {
      expect(
        i18n.translate('a.b.c', {
          defaultMessage: 'foo {a}, {b}, {c} bar',
          values: { a: 1, b: 2, c: 3 },
        })
      ).toBe('foo 1, 2, 3 bar');
    });

    test('should format pluralized messages', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: `You have {numPhotos, plural,
                      =0 {no photos.}
                      =1 {one photo.}
                      other {# photos.}
                   }`,
        },
      });

      expect(
        i18n.translate('a.b.c', { defaultMessage: 'UNUSED', values: { numPhotos: 0 } } as any)
      ).toBe('You have no photos.');
      expect(
        i18n.translate('a.b.c', { defaultMessage: 'UNUSED', values: { numPhotos: 1 } } as any)
      ).toBe('You have one photo.');
      expect(
        i18n.translate('a.b.c', { defaultMessage: 'UNUSED', values: { numPhotos: 1000 } } as any)
      ).toBe('You have 1,000 photos.');
    });

    test('should format pluralized default messages', () => {
      expect(
        i18n.translate('a.b.c', {
          values: { numPhotos: 0 },
          defaultMessage: `You have {numPhotos, plural,
                             =0 {no photos.}
                             =1 {one photo.}
                             other {# photos.}
                          }`,
        })
      ).toBe('You have no photos.');

      expect(
        i18n.translate('a.b.c', {
          values: { numPhotos: 1 },
          defaultMessage: `You have {numPhotos, plural,
                             =0 {no photos.}
                             =1 {one photo.}
                             other {# photos.}
                          }`,
        })
      ).toBe('You have one photo.');

      expect(
        i18n.translate('a.b.c', {
          values: { numPhotos: 1000 },
          defaultMessage: `You have {numPhotos, plural,
                             =0 {no photos.}
                             =1 {one photo.}
                             other {# photos.}
                          }`,
        })
      ).toBe('You have 1,000 photos.');
    });

    test('should throw error if wrong context is provided to the translation string', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: `You have {numPhotos, plural,
                      =0 {no photos.}
                      =1 {one photo.}
                      other {# photos.}
                   }`,
        },
      });

      expect(() => i18n.translate('a.b.c', { values: { foo: 0 } } as any))
        .toThrowErrorMatchingInlineSnapshot(`
        "[I18n] Error formatting the default message for: \\"a.b.c\\".
        Error: Missing \`defaultMessage\`."
      `);

      expect(() =>
        i18n.translate('d.e.f', {
          values: { bar: 1000 },
          defaultMessage: `You have {numPhotos, plural,
                             =0 {no photos.}
                             =1 {one photo.}
                             other {# photos.}
                          }`,
        })
      ).toThrowErrorMatchingSnapshot();
    });

    test('should format messages with percent formatter', () => {
      i18n.init({
        locale: 'en',
        messages: {},
      });

      expect(
        i18n.translate('a.b.c', {
          defaultMessage: 'Result: {result, number, percent}',
          values: { result: 0.15 },
        })
      ).toBe('Result: 15%');

      expect(
        i18n.translate('d.e.f', {
          values: { result: 0.15 },
          defaultMessage: 'Result: {result, number, percent}',
        })
      ).toBe('Result: 15%');
    });

    test('should format messages with date formatter', () => {
      i18n.init({
        locale: 'en',
        messages: {},
      });

      expect(
        i18n.translate('a.short', {
          defaultMessage: 'Sale begins {start, date, short}',
          values: { start: new Date(2018, 5, 20) },
        } as any)
      ).toBe('Sale begins 6/20/18');

      expect(
        i18n.translate('a.medium', {
          defaultMessage: 'Sale begins {start, date, medium}',
          values: { start: new Date(2018, 5, 20) },
        } as any)
      ).toBe('Sale begins Jun 20, 2018');

      expect(
        i18n.translate('a.long', {
          defaultMessage: 'Sale begins {start, date, long}',
          values: { start: new Date(2018, 5, 20) },
        } as any)
      ).toBe('Sale begins June 20, 2018');

      expect(
        i18n.translate('a.full', {
          defaultMessage: 'Sale begins {start, date, full}',
          values: { start: new Date(2018, 5, 20) },
        } as any)
      ).toBe('Sale begins Wednesday, June 20, 2018');
    });

    test('should format default messages with date formatter', () => {
      expect(
        i18n.translate('foo', {
          defaultMessage: 'Sale begins {start, date, short}',
          values: { start: new Date(2018, 5, 20) },
        })
      ).toBe('Sale begins 6/20/18');

      expect(
        i18n.translate('foo', {
          defaultMessage: 'Sale begins {start, date, medium}',
          values: { start: new Date(2018, 5, 20) },
        })
      ).toBe('Sale begins Jun 20, 2018');

      expect(
        i18n.translate('foo', {
          defaultMessage: 'Sale begins {start, date, long}',
          values: { start: new Date(2018, 5, 20) },
        })
      ).toBe('Sale begins June 20, 2018');

      expect(
        i18n.translate('foo', {
          defaultMessage: 'Sale begins {start, date, full}',
          values: { start: new Date(2018, 5, 20) },
        })
      ).toBe('Sale begins Wednesday, June 20, 2018');
    });

    test('should format messages with time formatter', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.short']: 'Coupon expires at {expires, time, short}',
          ['a.medium']: 'Coupon expires at {expires, time, medium}',
        },
      });

      expect(
        i18n.translate('a.short', {
          defaultMessage: 'UNUSED',
          values: { expires: new Date(2018, 5, 20, 18, 40, 30, 50) },
        } as any)
      ).toBe('Coupon expires at 6:40 PM');

      expect(
        i18n.translate('a.medium', {
          defaultMessage: 'UNUSED',
          values: { expires: new Date(2018, 5, 20, 18, 40, 30, 50) },
        } as any)
      ).toBe('Coupon expires at 6:40:30 PM');
    });

    test('should format default messages with time formatter', () => {
      expect(
        i18n.translate('foo', {
          defaultMessage: 'Coupon expires at {expires, time, short}',
          values: { expires: new Date(2018, 5, 20, 18, 40, 30, 50) },
        })
      ).toBe('Coupon expires at 6:40 PM');

      expect(
        i18n.translate('foo', {
          defaultMessage: 'Coupon expires at {expires, time, medium}',
          values: { expires: new Date(2018, 5, 20, 18, 40, 30, 50) },
        })
      ).toBe('Coupon expires at 6:40:30 PM');
    });

    test('should use default format if passed format option is not specified', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: 'Your total is {total, number, usd}',
        },
      });

      expect(i18n.translate('a.b.c', { defaultMessage: 'NOT USED', values: { total: 1000 } })).toBe(
        'Your total is 1,000'
      );

      expect(
        i18n.translate('d.e.f', {
          values: { total: 1000 },
          defaultMessage: 'Your total is {total, number, foo}',
        })
      ).toBe('Your total is 1,000');
    });

    test('should throw error if used format is not specified', () => {
      i18n.init({
        locale: 'en',
        messages: {
          ['a.b.c']: 'Your total is {total, foo}',
        },
      });

      expect(() => i18n.translate('a.b.c', { values: { total: 1 } } as any))
        .toThrowErrorMatchingInlineSnapshot(`
        "[I18n] Error formatting the default message for: \\"a.b.c\\".
        Error: Missing \`defaultMessage\`."
      `);

      expect(() =>
        i18n.translate('d.e.f', {
          values: { total: 1000 },
          defaultMessage: 'Your total is {total, bar}',
        })
      ).toThrowErrorMatchingSnapshot();
    });
  });

  describe('init', () => {
    test('should not initialize the engine if messages are not specified', () => {
      i18n.init();
      expect(i18n.getTranslation()).toEqual(createExpectedTranslations('en', { messages: {} }));
    });

    test('should throw error if locale is not specified', () => {
      expect(() => i18n.init({ locale: '', messages: {} })).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] A \`locale\` must be a non-empty string to add messages."`
      );

      // @ts-expect-error
      expect(() => i18n.init({ messages: {} })).toThrowErrorMatchingInlineSnapshot(
        `"[I18n] A \`locale\` must be a non-empty string to add messages."`
      );
    });

    test('should add messages if locale is specified', () => {
      const locale = 'en';
      i18n.init({
        locale,
        messages: {
          foo: 'bar',
        },
      });

      expect(i18n.getTranslation()).toEqual(
        createExpectedTranslations(locale, {
          messages: {
            foo: 'bar',
          },
        })
      );
    });

    test('should set the current locale', () => {
      i18n.init({ locale: 'ru', messages: {} });
      expect(i18n.getLocale()).toBe('ru');
    });

    test('should add custom formats', () => {
      i18n.init({
        locale: 'ru',
        formats: {
          date: {
            custom: {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            },
          },
        },
        messages: {},
      });

      expect(i18n.getTranslation().formats?.date).toEqual({
        custom: {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        },
      });
    });
  });

  describe('load', () => {
    let mockFetch: jest.SpyInstance;
    beforeEach(() => {
      mockFetch = jest.spyOn(global as any, 'fetch').mockImplementation();
    });

    test('fails if server returns >= 400 status code', async () => {
      mockFetch.mockResolvedValue({ status: 400 });

      await expect(i18n.load('some-url')).rejects.toMatchInlineSnapshot(
        `[Error: Translations request failed with status code: 400]`
      );

      mockFetch.mockResolvedValue({ status: 404 });

      await expect(i18n.load('some-url')).rejects.toMatchInlineSnapshot(
        `[Error: Translations request failed with status code: 404]`
      );
    });

    test('initializes engine with received translations', async () => {
      const translations: TranslationInput = {
        locale: 'en-XA',
        formats: {
          number: { currency: { style: 'currency' } },
        },
        messages: { 'common.ui.someLabel': 'some label' },
      };

      mockFetch.mockResolvedValue({
        status: 200,
        json: jest.fn().mockResolvedValue(translations),
      });

      await expect(i18n.load('some-url')).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('some-url', { credentials: 'same-origin' });

      expect(i18n.getTranslation()).toEqual(createExpectedTranslations('en-xa', translations));
    });
  });

  // Note: initDefault tests are below in a separate non-skipped block.
});

// Tests for initDefault are in their own describe so they are not affected
// by the skip on the main block (which is gated on a broader i18n tooling fix).
describe('i18n.initDefault', () => {
  let i18n: typeof i18nModule;

  beforeEach(() => {
    i18n = jest.requireActual('./i18n');
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('marks the engine as initialized', () => {
    expect(i18n.getIsInitialized()).toBe(false);
    i18n.initDefault();
    expect(i18n.getIsInitialized()).toBe(true);
  });

  test('locale remains English and no messages are loaded', () => {
    i18n.initDefault();
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.getTranslation().messages).toEqual({});
  });

  test('is idempotent — calling twice does not throw', () => {
    expect(() => {
      i18n.initDefault();
      i18n.initDefault();
    }).not.toThrow();
    expect(i18n.getIsInitialized()).toBe(true);
  });
});
