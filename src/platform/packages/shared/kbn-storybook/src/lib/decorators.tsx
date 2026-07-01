/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of, Subject } from 'rxjs';
import React, { useEffect } from 'react';
import { action } from '@storybook/addon-actions';
import type { Decorator } from '@storybook/react';
import { I18nProvider } from '@kbn/i18n-react';

import 'core_styles';
import { BehaviorSubject } from 'rxjs';
import type { CoreTheme } from '@kbn/core-theme-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import { KibanaRootContextProvider } from '@kbn/react-kibana-context-root';
import { i18n } from '@kbn/i18n';

import { DEFAULT_THEME, getKibanaTheme } from './themes';
import { EMBEDDABLE_RESIZE_EVENT, EMBEDDABLE_STORYBOOK_TAG } from './embeddable';

const theme$ = new BehaviorSubject<CoreTheme>(getKibanaTheme(DEFAULT_THEME));
const userProfile = { getUserProfile$: () => of(null) };

const i18nStart: I18nStart = {
  Context: ({ children }) => <I18nProvider>{children}</I18nProvider>,
};

const analytics: AnalyticsServiceStart = {
  reportEvent: action('Report telemetry event'),
  optIn: action('Opt in'),
  telemetryCounter$: new Subject(),
};

/**
 * Storybook decorator using the `KibanaContextProvider`. Uses the value from
 * `globals` provided by the Storybook theme switcher to set the `colorMode`.
 */
const KibanaContextDecorator: Decorator = (storyFn, { globals }) => {
  // TODO: Add a switcher to see components in other locales or pseudo locale
  i18n.init({ locale: 'en', messages: {} });
  const { darkMode, name } = getKibanaTheme(globals.euiTheme);

  useEffect(() => {
    theme$.next({ darkMode, name });
  }, [darkMode, name, globals.euiTheme]);

  return (
    <KibanaRootContextProvider {...{ theme: { theme$ }, userProfile, analytics, i18n: i18nStart }}>
      {storyFn()}
    </KibanaRootContextProvider>
  );
};

/**
 * When an embeddable story renders inside an iframe (the docs-builder fallback),
 * report the measured height to the parent via {@link EMBEDDABLE_RESIZE_EVENT}
 * so the host can auto-size the iframe.
 */
const EmbeddableResize: React.FC<{ storyId: string; children: React.ReactNode }> = ({
  storyId,
  children,
}) => {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) {
      return;
    }

    const root = document.documentElement;
    const post = () => {
      const height = Math.ceil(root.getBoundingClientRect().height);
      window.parent.postMessage({ type: EMBEDDABLE_RESIZE_EVENT, storyId, height }, '*');
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(post) : undefined;

    observer?.observe(root);
    post();

    return () => observer?.disconnect();
  }, [storyId]);

  return <>{children}</>;
};

const EmbeddableResizeDecorator: Decorator = (storyFn, { id, tags }) =>
  tags?.includes(EMBEDDABLE_STORYBOOK_TAG) ? (
    <EmbeddableResize storyId={id}>{storyFn()}</EmbeddableResize>
  ) : (
    storyFn()
  );

export const decorators = [KibanaContextDecorator, EmbeddableResizeDecorator];
