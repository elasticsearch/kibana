/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type {
  ChromeBadge,
  ChromeBreadcrumbsBadge,
  ChromeHelpExtension,
} from '@kbn/core-chrome-browser';
import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal-types';

type ChromeStorybookStart = Pick<
  InternalChromeStart,
  'getBadge$' | 'getBreadcrumbsBadges$' | 'getHelpExtension$'
> & {
  help: Pick<InternalChromeStart['help'], 'getFeedbackHandler$' | 'getNewsfeedHandler$'>;
  componentDeps: {
    basePath: Pick<InternalChromeStart['componentDeps']['basePath'], 'get' | 'prepend'>;
    legacyActionMenu$: InternalChromeStart['componentDeps']['legacyActionMenu$'];
    capabilities: Pick<InternalChromeStart['componentDeps']['capabilities'], 'navLinks'>;
    docTitleParts$: InternalChromeStart['componentDeps']['docTitleParts$'];
  };
};

/**
 * Storybook-safe `InternalChromeStart` stub.
 *
 * Unlike {@link chromeServiceMock}, this does not use `jest`, so it can run in the Storybook
 * runtime. It implements only the surface Chrome-owned React components read when rendered
 * under `ChromeServiceProvider` (base path, the legacy action menu, capabilities, the feedback
 * handler, and the badge/help observables); everything else is intentionally omitted behind a
 * single cast.
 */
export const createChromeStorybookStart = (): InternalChromeStart => {
  const getFeedbackHandler$ = () => new BehaviorSubject<(() => void) | undefined>(undefined);
  const getNewsfeedHandler$ = () => new BehaviorSubject(undefined);
  const start: ChromeStorybookStart = {
    componentDeps: {
      basePath: {
        get: () => '',
        prepend: (path: string) => path,
      },
      legacyActionMenu$: new BehaviorSubject(undefined),
      capabilities: {
        navLinks: { integrations: true },
      },
      docTitleParts$: new BehaviorSubject<readonly string[]>(['Elastic']),
    },
    help: {
      getFeedbackHandler$,
      getNewsfeedHandler$,
    },
    getBadge$: () => new BehaviorSubject<ChromeBadge | undefined>(undefined),
    getBreadcrumbsBadges$: () => new BehaviorSubject<ChromeBreadcrumbsBadge[]>([]),
    getHelpExtension$: () => new BehaviorSubject<ChromeHelpExtension | undefined>(undefined),
  };

  return start as InternalChromeStart;
};
