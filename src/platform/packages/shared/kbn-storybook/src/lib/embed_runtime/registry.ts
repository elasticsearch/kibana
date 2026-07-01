/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createRoot } from 'react-dom/client';
import { composeStories, setProjectAnnotations } from '@storybook/react';
import type { EmbeddableStoryParameters } from '../embeddable';
import type {
  ComposedStory,
  CreateDocsRegistryOptions,
  DocsRegistry,
  MountStoryOptions,
} from './types';
import { createShadowMount, createStoryElement } from './render';
import { createResizeController } from './resize';

const getEmbeddableParameters = (story: ComposedStory): EmbeddableStoryParameters =>
  story.parameters?.embeddable ?? {};

/**
 * Browser runtime behind each alias's inline registry bundle. The generated
 * `registry_entry.js` supplies the dynamic story-import map and calls this;
 * keeping the logic here rather than in a generated string keeps it typed,
 * linted, and unit-tested.
 */
export const createDocsRegistry = ({
  alias,
  storyModules,
  projectAnnotations,
}: CreateDocsRegistryOptions): DocsRegistry => {
  const roots = new WeakMap<HTMLElement, ReturnType<typeof createRoot>>();
  const resize = createResizeController();
  const annotations = setProjectAnnotations(projectAnnotations);

  const getComposedStory = async (storybookId: string): Promise<ComposedStory> => {
    const loadStoryModule = storyModules[storybookId];

    if (!loadStoryModule) {
      throw new Error(`Unknown Storybook docs story [${storybookId}]`);
    }

    const stories = composeStories(
      (await loadStoryModule()) as Parameters<typeof composeStories>[0],
      annotations as Parameters<typeof composeStories>[1]
    );
    const Story = Object.values(stories).find(
      (story) => (story as ComposedStory).id === storybookId
    );

    if (!Story) {
      throw new Error(`Storybook module did not compose story [${storybookId}]`);
    }

    return Story as unknown as ComposedStory;
  };

  const unmountStory = (container: HTMLElement): void => {
    resize.disconnect(container);

    const root = roots.get(container);

    if (!root) {
      return;
    }

    root.unmount();
    roots.delete(container);
  };

  const mountStory = async (
    storybookId: string,
    container: HTMLElement,
    options: MountStoryOptions = {}
  ): Promise<void> => {
    const Story = await getComposedStory(storybookId);

    unmountStory(container);

    const { height } = getEmbeddableParameters(Story);

    if (typeof height === 'number') {
      container.style.minHeight = `${height}px`;
    }

    const { renderNode, styleContainer } = createShadowMount(container);
    const root = createRoot(renderNode);
    roots.set(container, root);
    root.render(createStoryElement(Story, styleContainer));
    resize.observe(container, renderNode, storybookId, options.onResize);
  };

  const getStoryParameters = async (storybookId: string): Promise<EmbeddableStoryParameters> =>
    getEmbeddableParameters(await getComposedStory(storybookId));

  const registry: DocsRegistry = { mountStory, unmountStory, getStoryParameters };

  if (typeof window !== 'undefined') {
    window.__kbnStorybookDocsRegistries__ = window.__kbnStorybookDocsRegistries__ ?? {};
    window.__kbnStorybookDocsRegistries__[alias] = registry;
  }

  return registry;
};
