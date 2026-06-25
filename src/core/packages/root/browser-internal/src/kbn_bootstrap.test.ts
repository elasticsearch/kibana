/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  apmSystem,
  fatalErrorMock,
  i18nLoad,
  i18nInitDefault,
  i18nGetIsInitialized,
  setAvailableLocalesMock,
} from './kbn_bootstrap.test.mocks';
import { __kbnBootstrap__ } from '.';

const setMetadata = (
  translationsUrl: string | null = '/translations/abc123/en.json',
  availableLocales: Array<{ id: string; label: string }> = [{ id: 'en', label: 'English' }]
) => {
  const metadata = {
    i18n: { translationsUrl, availableLocales },
    vars: { apmConfig: null },
  };
  // eslint-disable-next-line no-unsanitized/property
  document.body.innerHTML = `<kbn-injected-metadata data=${JSON.stringify(metadata)}>
</kbn-injected-metadata>`;
};

describe('kbn_bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.performance.mark = jest.fn();
    setMetadata();
  });

  it('does not report a fatal error if apm load fails', async () => {
    apmSystem.setup.mockRejectedValueOnce(new Error('reason'));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementationOnce(() => undefined);

    await __kbnBootstrap__();

    expect(fatalErrorMock.add).toHaveBeenCalledTimes(0);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a fatal error if i18n load fails', async () => {
    i18nLoad.mockRejectedValueOnce(new Error('reason'));

    await __kbnBootstrap__();

    expect(fatalErrorMock.add).toHaveBeenCalledTimes(1);
  });

  it('skips i18n.load and does not report a fatal error when i18n is already initialized', async () => {
    i18nGetIsInitialized.mockReturnValueOnce(true);

    await __kbnBootstrap__();

    expect(i18nLoad).not.toHaveBeenCalled();
    expect(fatalErrorMock.add).not.toHaveBeenCalled();
  });

  it('loads the translationsUrl verbatim from injected metadata', async () => {
    setMetadata('/translations/ghi789/ja-JP.json');

    await __kbnBootstrap__();

    expect(i18nLoad).toHaveBeenCalledWith('/translations/ghi789/ja-JP.json');
  });

  it('calls initDefault and skips i18n.load when translationsUrl is null', async () => {
    setMetadata(null);

    await __kbnBootstrap__();

    expect(i18nLoad).not.toHaveBeenCalled();
    expect(i18nInitDefault).toHaveBeenCalledTimes(1);
    expect(fatalErrorMock.add).not.toHaveBeenCalled();
  });

  it('calls i18n.load and skips initDefault when translationsUrl is a string', async () => {
    setMetadata('/translations/abc123/fr.json');

    await __kbnBootstrap__();

    expect(i18nLoad).toHaveBeenCalledWith('/translations/abc123/fr.json');
    expect(i18nInitDefault).not.toHaveBeenCalled();
  });

  it('hydrates the available locale registry from injected metadata', async () => {
    const availableLocales = [
      { id: 'en', label: 'English' },
      { id: 'ja-JP', label: '日本語' },
    ];
    setMetadata('/translations/abc123/en.json', availableLocales);

    await __kbnBootstrap__();

    expect(setAvailableLocalesMock).toHaveBeenCalledWith(availableLocales);
  });
});
