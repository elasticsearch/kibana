/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createRoot } from 'react-dom/client';
import createCache from '@emotion/cache';
import { EuiProvider, euiStylisPrefixer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { I18nProvider } from '@kbn/i18n-react';
import { createDocsRegistry } from '.';
import { EMBEDDABLE_RESIZE_EVENT } from '../embeddable';

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({ render: jest.fn(), unmount: jest.fn() })),
}));

jest.mock('@storybook/react', () => ({
  setProjectAnnotations: (annotations: unknown) => annotations,
  composeStories: (storyModule: { stories: Record<string, unknown> }) => storyModule.stories,
}));

jest.mock('@emotion/cache', () => ({
  __esModule: true,
  default: jest.fn((options: unknown) => ({ options })),
}));

jest.mock('@elastic/eui', () => ({
  EuiProvider: function MockEuiProvider() {
    return null;
  },
  euiStylisPrefixer: { name: 'euiStylisPrefixer' },
}));

jest.mock('@kbn/i18n', () => ({
  i18n: { getIsInitialized: jest.fn(() => false), init: jest.fn() },
}));

jest.mock('@kbn/i18n-react', () => ({
  I18nProvider: function MockI18nProvider() {
    return null;
  },
}));

const composeStory = (id: string, parameters?: Record<string, unknown>) =>
  Object.assign(() => null, { id, parameters });

const storyModuleFor = (story: ReturnType<typeof composeStory>) => () =>
  Promise.resolve({ stories: { Default: story } });

// jsdom is unavailable under the Node jest preset, so stand in a minimal EventTarget-backed element.
class FakeContainer extends EventTarget {
  public style: Record<string, string> = {};
  public getBoundingClientRect = () => ({ height: 40 } as DOMRect);
}

const makeContainer = () => new FakeContainer() as unknown as HTMLElement;

describe('createDocsRegistry', () => {
  it('registers the alias on the window registry map', () => {
    (global as unknown as { window?: object }).window = {};
    try {
      const registry = createDocsRegistry({
        alias: 'shared_ux',
        storyModules: {},
        projectAnnotations: {},
      });

      expect(window.__kbnStorybookDocsRegistries__?.shared_ux).toBe(registry);
    } finally {
      delete (global as unknown as { window?: object }).window;
    }
  });

  it('exposes embeddable parameters via getStoryParameters', async () => {
    const registry = createDocsRegistry({
      alias: 'shared_ux',
      storyModules: {
        'button--default': storyModuleFor(
          composeStory('button--default', { embeddable: { height: 120 } })
        ),
      },
      projectAnnotations: {},
    });

    await expect(registry.getStoryParameters('button--default')).resolves.toEqual({ height: 120 });
  });

  it('defaults to empty parameters when a story declares none', async () => {
    const registry = createDocsRegistry({
      alias: 'shared_ux',
      storyModules: { 'button--default': storyModuleFor(composeStory('button--default')) },
      projectAnnotations: {},
    });

    await expect(registry.getStoryParameters('button--default')).resolves.toEqual({});
  });

  it('throws for an unknown story id', async () => {
    const registry = createDocsRegistry({
      alias: 'shared_ux',
      storyModules: {},
      projectAnnotations: {},
    });

    await expect(registry.getStoryParameters('missing--story')).rejects.toThrow(
      'Unknown Storybook docs story [missing--story]'
    );
  });

  it('applies the height hint and reports a measured size on mount', async () => {
    const registry = createDocsRegistry({
      alias: 'shared_ux',
      storyModules: {
        'button--default': storyModuleFor(
          composeStory('button--default', { embeddable: { height: 96 } })
        ),
      },
      projectAnnotations: {},
    });
    const container = makeContainer();
    const onResize = jest.fn();
    const heights: number[] = [];

    container.addEventListener(EMBEDDABLE_RESIZE_EVENT, (event) => {
      heights.push((event as CustomEvent<{ height: number }>).detail.height);
    });

    await registry.mountStory('button--default', container, { onResize });

    // jsdom lacks ResizeObserver, so the runtime falls back to a single synchronous report.
    expect(container.style.minHeight).toBe('96px');
    expect(onResize).toHaveBeenCalledWith({ height: 40 });
    expect(heights).toEqual([40]);
  });

  it('renders into a shadow root and scopes Emotion to it', async () => {
    const previousDocument = (global as { document?: unknown }).document;
    const renderNode = {
      tagName: 'DIV',
      getBoundingClientRect: () => ({ height: 12 } as DOMRect),
    } as unknown as HTMLElement;
    (global as { document?: unknown }).document = { createElement: () => renderNode };

    const shadowRoot = {
      replaceChildren: jest.fn(),
      appendChild: jest.fn(),
    } as unknown as ShadowRoot;
    const fakeContainer = makeContainer() as unknown as {
      shadowRoot: ShadowRoot | null;
      attachShadow: jest.Mock;
    };
    fakeContainer.shadowRoot = null;
    fakeContainer.attachShadow = jest.fn(() => {
      fakeContainer.shadowRoot = shadowRoot;
      return shadowRoot;
    });
    const container = fakeContainer as unknown as HTMLElement;
    const onResize = jest.fn();

    try {
      const registry = createDocsRegistry({
        alias: 'shared_ux',
        storyModules: { 'button--default': storyModuleFor(composeStory('button--default')) },
        projectAnnotations: {},
      });

      await registry.mountStory('button--default', container, { onResize });

      // React mounts into the shadow root's node, not the host container.
      expect(createRoot).toHaveBeenLastCalledWith(renderNode);
      expect(shadowRoot.appendChild).toHaveBeenCalledWith(renderNode);

      // Emotion is pointed at the shadow root so EUI styles stay inside the boundary.
      const cacheOptions = {
        key: 'css',
        container: shadowRoot,
        stylisPlugins: [euiStylisPrefixer],
      };
      expect(createCache).toHaveBeenCalledWith(cacheOptions);

      // The story renders under an EuiProvider so the EUI reset/theme land in the shadow root,
      // wrapped in an I18nProvider so `@kbn/i18n-react` stories find their IntlProvider.
      expect(i18n.init).toHaveBeenCalledWith({ locale: 'en', messages: {} });

      const rootResult = (createRoot as jest.Mock).mock.results.at(-1)?.value;
      const element = rootResult.render.mock.calls[0][0];
      expect(element.type).toBe(EuiProvider);
      expect(element.props.cache).toEqual({ options: cacheOptions });
      expect(element.props.children.type).toBe(I18nProvider);

      // Auto-sizing measures the rendered node (12), never the un-isolated host (40).
      expect(onResize).toHaveBeenCalledWith({ height: 12 });
    } finally {
      (global as { document?: unknown }).document = previousDocument;
    }
  });

  it('is idempotent across unmount', async () => {
    const registry = createDocsRegistry({
      alias: 'shared_ux',
      storyModules: { 'button--default': storyModuleFor(composeStory('button--default')) },
      projectAnnotations: {},
    });
    const container = makeContainer();

    await registry.mountStory('button--default', container);

    expect(() => registry.unmountStory(container)).not.toThrow();
    expect(() => registry.unmountStory(container)).not.toThrow();
  });
});
