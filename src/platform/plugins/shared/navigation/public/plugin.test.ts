/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom, of } from 'rxjs';
import { coreMock } from '@kbn/core/public/mocks';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { cloudMock } from '@kbn/cloud-plugin/public/mocks';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import type { Space } from '@kbn/spaces-plugin/public';
import type { BuildFlavor } from '@kbn/config';
import { NavigationPublicPlugin } from './plugin';

jest.mock('rxjs', () => {
  const original = jest.requireActual('rxjs');
  return {
    ...original,
    debounceTime: () => (source: any) => source,
  };
});

const setup = ({
  buildFlavor = 'traditional',
}: {
  buildFlavor?: BuildFlavor;
} = {}) => {
  const initializerContext = coreMock.createPluginInitializerContext({}, { buildFlavor });
  const plugin = new NavigationPublicPlugin(initializerContext);

  const setChromeStyle = jest.fn();
  const coreStart = coreMock.createStart();
  const unifiedSearch = unifiedSearchPluginMock.createStartContract();
  const cloud = cloudMock.createStart();
  const spaces = spacesPluginMock.createStartContract();

  const getGlobalSetting$ = jest.fn();
  const settingsGlobalClient = {
    ...coreStart.settings.globalClient,
    get$: getGlobalSetting$,
  };
  coreStart.settings.globalClient = settingsGlobalClient;
  coreStart.chrome.setChromeStyle = setChromeStyle;

  return {
    plugin,
    coreStart,
    unifiedSearch,
    cloud,
    spaces,
    setChromeStyle,
  };
};

describe('Navigation Plugin', () => {
  it('should init navigation when active space and definition are both available', async () => {
    const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

    spaces.getActiveSpace$ = jest
      .fn()
      .mockReturnValue(of({ solution: 'es' } as Pick<Space, 'solution'>));

    const navigationTree$ = of({ body: [] });
    const { addSolutionNavigation } = plugin.start(coreStart, { unifiedSearch, cloud, spaces });
    await new Promise((resolve) => setTimeout(resolve));

    addSolutionNavigation({
      id: 'es' as const,
      title: 'Elasticsearch',
      navigationTree$,
    });

    expect(coreStart.chrome.project.initNavigation).toHaveBeenCalledWith(
      'es',
      navigationTree$,
      undefined
    );
  });

  it('should not load the active space on non authenticated pages', async () => {
    const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

    coreStart.http.anonymousPaths.isAnonymous.mockReturnValue(true);

    const activeSpace$ = of({ solution: 'es' } as Pick<Space, 'solution'>);
    activeSpace$.pipe = jest.fn().mockReturnValue(activeSpace$);
    activeSpace$.subscribe = jest.fn().mockReturnValue(activeSpace$);
    spaces.getActiveSpace$ = jest.fn().mockReturnValue(activeSpace$);

    plugin.start(coreStart, { unifiedSearch, cloud, spaces });
    await new Promise((resolve) => setTimeout(resolve));

    expect(activeSpace$.pipe).not.toHaveBeenCalled();
    expect(activeSpace$.subscribe).not.toHaveBeenCalled();

    // Test that the activeSpace$ observable is accessed when not an anonymous path
    coreStart.http.anonymousPaths.isAnonymous.mockReturnValue(false);
    plugin.start(coreStart, { unifiedSearch, cloud, spaces });
    await new Promise((resolve) => setTimeout(resolve));

    expect(activeSpace$.pipe).toHaveBeenCalled();
    expect(activeSpace$.subscribe).toHaveBeenCalled();
  });

  describe('addSolutionNavigation()', () => {
    it('should not init navigation until active space is set', async () => {
      const { plugin, coreStart, unifiedSearch, spaces } = setup();

      const { addSolutionNavigation } = plugin.start(coreStart, {
        unifiedSearch,
        spaces,
      });
      await new Promise((resolve) => setTimeout(resolve));

      addSolutionNavigation({
        id: 'es' as const,
        title: 'Elasticsearch',
        navigationTree$: of({ body: [] }),
      });

      expect(coreStart.chrome.project.initNavigation).not.toHaveBeenCalled();
    });

    it('should init navigation when definition arrives after active space', async () => {
      const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

      spaces.getActiveSpace$ = jest
        .fn()
        .mockReturnValue(of({ solution: 'oblt' } as Pick<Space, 'solution'>));

      const navigationTree$ = of({ body: [] });
      const { addSolutionNavigation } = plugin.start(coreStart, {
        unifiedSearch,
        cloud,
        spaces,
      });
      await new Promise((resolve) => setTimeout(resolve));

      addSolutionNavigation({
        id: 'oblt' as const,
        title: 'Observability',
        navigationTree$,
      });

      expect(coreStart.chrome.project.initNavigation).toHaveBeenCalledWith(
        'oblt',
        navigationTree$,
        undefined
      );
    });
  });

  describe('set Chrome style', () => {
    it('should set the Chrome style to "classic" when spaces plugin is not available', async () => {
      const { plugin, coreStart, unifiedSearch, cloud } = setup();

      plugin.start(coreStart, { unifiedSearch, cloud });
      await new Promise((resolve) => setTimeout(resolve));
      expect(coreStart.chrome.setChromeStyle).toHaveBeenCalledWith('classic');
    });

    it('should set the Chrome style to "classic" when active space solution is "classic"', async () => {
      const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

      // Spaces plugin is available but activeSpace is undefined
      spaces.getActiveSpace$ = jest.fn().mockReturnValue(of(undefined));
      plugin.start(coreStart, { unifiedSearch, cloud, spaces });
      await new Promise((resolve) => setTimeout(resolve));
      expect(coreStart.chrome.setChromeStyle).toHaveBeenCalledWith('classic');

      // Spaces plugin is available and activeSpace has solution "classic"
      coreStart.chrome.setChromeStyle.mockReset();
      spaces.getActiveSpace$ = jest
        .fn()
        .mockReturnValue(of({ solution: 'classic' } as Pick<Space, 'solution'>));
      plugin.start(coreStart, { unifiedSearch, cloud, spaces });
      await new Promise((resolve) => setTimeout(resolve));
      expect(coreStart.chrome.setChromeStyle).toHaveBeenCalledWith('classic');
    });

    it('should NOT set the Chrome style when on serverless', async () => {
      const { plugin, coreStart, unifiedSearch, cloud } = setup({ buildFlavor: 'serverless' });

      plugin.start(coreStart, { unifiedSearch, cloud });
      await new Promise((resolve) => setTimeout(resolve));
      expect(coreStart.chrome.setChromeStyle).not.toHaveBeenCalled();
    });

    it('should set the Chrome style to "project" when space solution is a known solution', async () => {
      const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

      for (const solution of ['es', 'oblt', 'security']) {
        spaces.getActiveSpace$ = jest
          .fn()
          .mockReturnValue(of({ solution } as Pick<Space, 'solution'>));
        plugin.start(coreStart, { unifiedSearch, cloud, spaces });
        await new Promise((resolve) => setTimeout(resolve));
        expect(coreStart.chrome.setChromeStyle).toHaveBeenCalledWith('project');
        coreStart.chrome.setChromeStyle.mockReset();
      }

      spaces.getActiveSpace$ = jest.fn().mockReturnValue(of({ solution: 'unknown' }));
      plugin.start(coreStart, { unifiedSearch, cloud, spaces });
      await new Promise((resolve) => setTimeout(resolve));
      expect(coreStart.chrome.setChromeStyle).toHaveBeenCalledWith('classic');
    });
  });

  describe('isSolutionNavEnabled$', () => {
    it('should be off if spaces plugin not available', async () => {
      const { plugin, coreStart, unifiedSearch } = setup();

      const { isSolutionNavEnabled$ } = plugin.start(coreStart, {
        unifiedSearch,
      });
      await new Promise((resolve) => setTimeout(resolve));

      const isEnabled = await firstValueFrom(isSolutionNavEnabled$);
      expect(isEnabled).toBe(false);
    });

    it('should be off if spaces plugin `isSolutionViewEnabled` = false', async () => {
      const { plugin, coreStart, unifiedSearch, spaces } = setup();
      spaces.getActiveSpace$ = jest
        .fn()
        .mockReturnValue(of({ solution: 'es' } as Pick<Space, 'solution'>));

      spaces.isSolutionViewEnabled = false;

      const { isSolutionNavEnabled$ } = plugin.start(coreStart, {
        unifiedSearch,
        spaces,
      });
      await new Promise((resolve) => setTimeout(resolve));

      const isEnabled = await firstValueFrom(isSolutionNavEnabled$);
      expect(isEnabled).toBe(false);
    });

    it('should be off if space solution is "classic" or "undefined"', async () => {
      const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

      {
        spaces.getActiveSpace$ = jest
          .fn()
          .mockReturnValue(of({ solution: undefined } as Pick<Space, 'solution'>));

        const { isSolutionNavEnabled$ } = plugin.start(coreStart, {
          unifiedSearch,
          cloud,
          spaces,
        });
        await new Promise((resolve) => setTimeout(resolve));

        const isEnabled = await firstValueFrom(isSolutionNavEnabled$);
        expect(isEnabled).toBe(false);
      }

      {
        spaces.getActiveSpace$ = jest
          .fn()
          .mockReturnValue(of({ solution: 'classic' } as Pick<Space, 'solution'>));

        const { isSolutionNavEnabled$ } = plugin.start(coreStart, {
          unifiedSearch,
          cloud,
          spaces,
        });
        await new Promise((resolve) => setTimeout(resolve));

        const isEnabled = await firstValueFrom(isSolutionNavEnabled$);
        expect(isEnabled).toBe(false);
      }
    });

    it('should be on if space solution is set', async () => {
      const { plugin, coreStart, unifiedSearch, cloud, spaces } = setup();

      spaces.getActiveSpace$ = jest
        .fn()
        .mockReturnValue(of({ solution: 'es' } as Pick<Space, 'solution'>));

      const { isSolutionNavEnabled$ } = plugin.start(coreStart, {
        unifiedSearch,
        cloud,
        spaces,
      });
      await new Promise((resolve) => setTimeout(resolve));

      const isEnabled = await firstValueFrom(isSolutionNavEnabled$);
      expect(isEnabled).toBe(true);
    });

    it('on serverless flag must be disabled', async () => {
      const { plugin, coreStart, unifiedSearch, cloud } = setup({ buildFlavor: 'serverless' });

      const { isSolutionNavEnabled$ } = plugin.start(coreStart, {
        unifiedSearch,
        cloud,
      });
      await new Promise((resolve) => setTimeout(resolve));

      const isEnabled = await firstValueFrom(isSolutionNavEnabled$);
      expect(isEnabled).toBe(false);
    });
  });
});
