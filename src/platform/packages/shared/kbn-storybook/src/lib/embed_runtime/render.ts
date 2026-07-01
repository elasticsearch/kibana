/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentType, ReactElement } from 'react';
import { createElement } from 'react';
import createCache from '@emotion/cache';
import { EuiProvider, euiStylisPrefixer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { I18nProvider } from '@kbn/i18n-react';

export interface ShadowMount {
  /** Node React renders into; also the node measured for auto-sizing. */
  renderNode: HTMLElement;
  /** Shadow root Emotion targets, or `null` when shadow DOM is unavailable. */
  styleContainer: ShadowRoot | null;
}

/**
 * Renders each story inside a shadow root so the docs site's styles cannot bleed
 * into the embed. Reuses an existing root across remounts ({@link Element.attachShadow}
 * throws on a second call) and falls back to the container itself where shadow
 * DOM is unavailable (SSR, the Node test env).
 */
export const createShadowMount = (container: HTMLElement): ShadowMount => {
  if (typeof container.attachShadow !== 'function') {
    return { renderNode: container, styleContainer: null };
  }

  const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  shadowRoot.replaceChildren();

  const renderNode = document.createElement('div');
  shadowRoot.appendChild(renderNode);

  return { renderNode, styleContainer: shadowRoot };
};

// `I18nProvider` throws unless `@kbn/i18n` is initialized.
const ensureI18nInitialized = (): void => {
  if (!i18n.getIsInitialized()) {
    i18n.init({ locale: 'en', messages: {} });
  }
};

/**
 * Wraps a story in the providers the running Storybook supplies via decorators.
 * The {@link EuiProvider}'s Emotion cache targets `styleContainer`, keeping EUI's
 * reset, utilities, theme, and component styles inside the shadow boundary rather
 * than the unreachable document head; the {@link I18nProvider} serves
 * `@kbn/i18n-react` consumers. Returns the bare story when not isolated.
 */
export const createStoryElement = (
  Story: ComponentType,
  styleContainer: ShadowRoot | null
): ReactElement => {
  const story = createElement(Story);

  if (!styleContainer) {
    return story;
  }

  ensureI18nInitialized();

  return createElement(
    EuiProvider,
    {
      cache: createCache({
        key: 'css',
        container: styleContainer,
        stylisPlugins: [euiStylisPrefixer],
      }),
    },
    createElement(I18nProvider, null, story)
  );
};
