/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentType } from 'react';
import type { setProjectAnnotations } from '@storybook/react';
import type { EmbeddableStoryParameters } from '../embeddable';

export type StoryModuleLoader = () => Promise<Record<string, unknown>>;
export type StoryModules = Record<string, StoryModuleLoader>;

/** A composed story: renderable as a component, carrying its id and embeddable parameters. */
export type ComposedStory = ComponentType & {
  id: string;
  parameters?: { embeddable?: EmbeddableStoryParameters };
};

export interface MountStoryOptions {
  onResize?: (size: { height: number }) => void;
}

export interface DocsRegistry {
  mountStory: (
    storybookId: string,
    container: HTMLElement,
    options?: MountStoryOptions
  ) => Promise<void>;
  unmountStory: (container: HTMLElement) => void;
  getStoryParameters: (storybookId: string) => Promise<EmbeddableStoryParameters>;
}

export interface CreateDocsRegistryOptions {
  alias: string;
  storyModules: StoryModules;
  projectAnnotations: Parameters<typeof setProjectAnnotations>[0];
}

declare global {
  interface Window {
    __kbnStorybookDocsRegistries__?: Record<string, DocsRegistry>;
  }
}
