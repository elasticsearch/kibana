/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EMBEDDABLE_RESIZE_EVENT } from '../embeddable';
import type { EmbeddableResizePayload } from '../embeddable';
import type { MountStoryOptions } from './types';

export interface ResizeController {
  observe: (
    container: HTMLElement,
    measureNode: HTMLElement,
    storyId: string,
    onResize: MountStoryOptions['onResize']
  ) => void;
  disconnect: (container: HTMLElement) => void;
}

const reportSize = (
  container: HTMLElement,
  measureNode: HTMLElement,
  storyId: string,
  onResize: MountStoryOptions['onResize']
): void => {
  const height = Math.ceil(measureNode.getBoundingClientRect().height);

  onResize?.({ height });

  // Dispatched on the host (light DOM) so it bubbles to docs-builder.
  container.dispatchEvent(
    new CustomEvent<EmbeddableResizePayload>(EMBEDDABLE_RESIZE_EVENT, {
      detail: { storyId, height },
      bubbles: true,
    })
  );
};

/** Reports each embed's measured height via {@link EMBEDDABLE_RESIZE_EVENT}, owning the observers per container. */
export const createResizeController = (): ResizeController => {
  const observers = new WeakMap<HTMLElement, ResizeObserver>();

  return {
    observe: (container, measureNode, storyId, onResize) => {
      if (typeof ResizeObserver === 'undefined') {
        reportSize(container, measureNode, storyId, onResize);
        return;
      }

      const observer = new ResizeObserver(() =>
        reportSize(container, measureNode, storyId, onResize)
      );
      observer.observe(measureNode);
      observers.set(container, observer);
    },
    disconnect: (container) => {
      observers.get(container)?.disconnect();
      observers.delete(container);
    },
  };
};
