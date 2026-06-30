/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import type {
  AppMenuConfig,
  AppMenuItemType,
  AppMenuStaticItem,
} from '@kbn/core-chrome-app-menu-components';
import { APP_MENU_SHARE_ID, getTooltip, isDisabled } from '@kbn/core-chrome-app-menu-components';
import { useChromeService } from '@kbn/core-chrome-browser-context';
import { useObservable } from '@kbn/use-observable';
import { i18n } from '@kbn/i18n';

import { useBasePath } from './chrome';
import { APP_HEADER_TEST_SUBJECTS } from '../test_subjects';

const createIntegrationsMenuItem = (href: string): AppMenuStaticItem => ({
  label: i18n.translate('core.chrome.appHeader.addIntegrationsMenuItemLabel', {
    defaultMessage: 'Add integrations',
  }),
  id: 'addIntegrations',
  iconType: 'indexOpen',
  order: 0,
  href,
  testId: APP_HEADER_TEST_SUBJECTS.menuAddIntegrations,
});

const createFeedbackMenuItem = (feedbackHandler: () => void): AppMenuStaticItem => ({
  label: i18n.translate('core.chrome.appHeader.feedbackMenuItemLabel', {
    defaultMessage: 'Feedback',
  }),
  id: 'feedback',
  iconType: 'comment',
  order: 1,
  run: feedbackHandler,
  global: true,
  testId: APP_HEADER_TEST_SUBJECTS.menuFeedback,
});

const createDocumentationMenuItem = (href: string): AppMenuStaticItem => ({
  label: i18n.translate('core.chrome.appHeader.documentationMenuItemLabel', {
    defaultMessage: 'Documentation',
  }),
  id: 'documentation',
  iconType: 'documentation',
  order: 2,
  href,
  target: '_blank',
  testId: APP_HEADER_TEST_SUBJECTS.menuDocumentation,
});

interface ResolvedAppMenu {
  menu: AppMenuConfig | undefined;
  shareItem: AppMenuItemType | undefined;
}

const useStaticItems = ({
  docLink: explicitDocLink,
  showAddIntegrations,
}: {
  docLink?: string;
  showAddIntegrations?: boolean;
}) => {
  const chrome = useChromeService();
  const basePath = useBasePath();
  const feedbackHandler = useObservable(chrome.next.getFeedbackHandler$(), undefined);
  const helpExtension = useObservable(chrome.getHelpExtension$(), undefined);

  return useMemo(() => {
    const staticItems: AppMenuStaticItem[] = [];

    if (feedbackHandler) {
      staticItems.push(createFeedbackMenuItem(feedbackHandler));
    }

    /**
     * Precedence: <AppHeader/> docLink prop -> chrome.getAppDocumentationLink$() -> chrome.getHelpExtension$()
     */
    const docLink =
      explicitDocLink ??
      helpExtension?.links?.find((link) => link.linkType === 'documentation')?.href;

    if (docLink) {
      staticItems.push(createDocumentationMenuItem(docLink));
    }

    if (showAddIntegrations) {
      // FIXME: https://github.com/elastic/kibana/issues/271295 - handle edge case where fleet is not enabled or user doesn't have permissions to view it
      staticItems.push(createIntegrationsMenuItem(basePath.prepend('/app/integrations/browse')));
    }

    return staticItems;
  }, [basePath, explicitDocLink, helpExtension, showAddIntegrations, feedbackHandler]);
};

const useResolvedAppMenu = (menu: AppMenuConfig | undefined): ResolvedAppMenu => {
  return useMemo((): ResolvedAppMenu => {
    if (!menu) return { menu: undefined, shareItem: undefined };

    // Temporary bridge: share is still modeled as a legacy app-menu item.
    // Replace this with a typed app-header action once share requirements are clear.
    // https://github.com/elastic/kibana/issues/271401
    const shareItem = menu.items?.find((item) => item.id === APP_MENU_SHARE_ID);

    if (!shareItem) return { menu, shareItem: undefined };

    return {
      menu: { ...menu, items: menu.items?.filter((item) => item.id !== APP_MENU_SHARE_ID) },
      shareItem,
    };
  }, [menu]);
};

export function useAppHeaderMenu(
  pageAppMenu: AppMenuConfig | undefined,
  docLink?: string,
  showAddIntegrations?: boolean
): {
  config: AppMenuConfig | undefined;
  staticItems: AppMenuStaticItem[];
} {
  const { menu } = useResolvedAppMenu(pageAppMenu);
  const staticItems = useStaticItems({ docLink, showAddIntegrations });

  return {
    config: menu,
    staticItems,
  };
}

export interface ShareAction {
  onClick: (triggerElement: HTMLElement) => void;
  tooltipContent?: string;
  tooltipTitle?: string;
  testId?: string;
  isDisabled?: boolean;
}

export function useShareAction(pageAppMenu: AppMenuConfig | undefined): ShareAction | undefined {
  const { shareItem } = useResolvedAppMenu(pageAppMenu);

  return useMemo(() => {
    if (!shareItem) return undefined;
    const { run, tooltipContent, tooltipTitle, testId, disableButton } = shareItem;
    if (!run) return undefined;

    const { content, title } = getTooltip({
      tooltipContent,
      tooltipTitle,
    });

    return {
      onClick: (triggerElement: HTMLElement) => {
        run({ triggerElement, returnFocus: () => triggerElement.focus() });
      },
      tooltipContent: content,
      tooltipTitle: title,
      testId,
      isDisabled: isDisabled(disableButton),
    };
  }, [shareItem]);
}
