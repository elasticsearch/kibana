/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StoryObj } from '@storybook/react';

/** Tag that opts a story into docs embedding (inline registry + iframe fallback). */
export const EMBEDDABLE_STORYBOOK_TAG = 'embeddable';

/**
 * Event the embed runtime emits with the measured story height. Dispatched as a
 * `CustomEvent` on the inline container and `postMessage`d from the iframe
 * fallback. Consumers (docs-builder) listen for it to auto-size the embed.
 */
export const EMBEDDABLE_RESIZE_EVENT = 'kbn-storybook-docs:resize';

/** Payload shared by the inline `CustomEvent` and the iframe `postMessage`. */
export interface EmbeddableResizePayload {
  /** Storybook ID of the measured story. */
  storyId: string;
  /** Measured content height in pixels. */
  height: number;
}

/**
 * Typed `parameters.embeddable` namespace. Runtime auto-sizing stays
 * authoritative; everything here is an optional authoring hint.
 */
export interface EmbeddableStoryParameters {
  /** Initial render height in pixels, used to reserve space and reduce layout shift before the embed measures itself. */
  height?: number;
}

/** Storybook `parameters` extended with the typed {@link EmbeddableStoryParameters} namespace. */
export interface EmbeddableParameters {
  embeddable?: EmbeddableStoryParameters;
}

// `EmbeddableStoryParameters & unknown` collapses to `EmbeddableStoryParameters`, so the named
// `embeddable` key stays strongly typed while arbitrary sibling parameters remain permitted.
type StoryParametersWithEmbeddable = EmbeddableParameters & Record<string, unknown>;

/**
 * Resolves to {@link StoryParametersWithEmbeddable} only when the
 * {@link EMBEDDABLE_STORYBOOK_TAG} is present in `TTags`, so a story's
 * `parameters` typing keys off its `tags` collection.
 */
export type EmbeddableParametersForTags<TTags extends readonly string[]> =
  typeof EMBEDDABLE_STORYBOOK_TAG extends TTags[number]
    ? StoryParametersWithEmbeddable
    : Record<string, unknown>;

/**
 * `StoryObj` for an embeddable story: requires the {@link EMBEDDABLE_STORYBOOK_TAG}
 * and strongly types `parameters.embeddable`. Prefer importing this as a type
 * (`import type`) from story files so no runtime code is pulled into the bundle.
 *
 * @example
 * export const Default: EmbeddableStoryObj<StoryArgs> = {
 *   tags: ['embeddable'],
 *   parameters: { embeddable: { height: 96 } },
 *   render: () => <Button />,
 * };
 */
export type EmbeddableStoryObj<TArgs = unknown> = Omit<StoryObj<TArgs>, 'tags' | 'parameters'> & {
  tags: readonly [typeof EMBEDDABLE_STORYBOOK_TAG, ...string[]];
  parameters?: StoryParametersWithEmbeddable;
};
