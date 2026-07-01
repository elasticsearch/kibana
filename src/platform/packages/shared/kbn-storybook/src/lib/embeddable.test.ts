/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EMBEDDABLE_RESIZE_EVENT, EMBEDDABLE_STORYBOOK_TAG } from './embeddable';
import type { EmbeddableParametersForTags, EmbeddableStoryObj } from './embeddable';

describe('embeddable', () => {
  it('exposes stable tag and resize event identifiers', () => {
    expect(EMBEDDABLE_STORYBOOK_TAG).toBe('embeddable');
    expect(EMBEDDABLE_RESIZE_EVENT).toBe('kbn-storybook-docs:resize');
  });

  // Type-level coverage: these assignments only compile when `parameters.embeddable`
  // is strongly typed and the embeddable tag is required.
  it('strongly types parameters.embeddable on an embeddable story', () => {
    const story: EmbeddableStoryObj<{ label: string }> = {
      tags: [EMBEDDABLE_STORYBOOK_TAG],
      parameters: { embeddable: { height: 96 }, layout: 'centered' },
      args: { label: 'AI' },
    };

    expect(story.parameters?.embeddable?.height).toBe(96);
  });

  it('keys parameter typing off the presence of the embeddable tag', () => {
    const embeddable: EmbeddableParametersForTags<['embeddable']> = {
      embeddable: { height: 120 },
    };
    const plain: EmbeddableParametersForTags<['other']> = { anything: true };

    expect(embeddable.embeddable?.height).toBe(120);
    expect(plain.anything).toBe(true);
  });
});
