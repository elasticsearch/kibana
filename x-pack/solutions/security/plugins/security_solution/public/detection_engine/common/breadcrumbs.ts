/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChromeBreadcrumb } from '@kbn/core/public';
import {
  RULE_DETAILS_TAB_NAME,
  RuleDetailTabs,
} from '../rule_details_ui/pages/rule_details/use_rule_details_tabs';
import {
  getRuleDetailsTabUrl,
  getRuleDetailsUrl,
} from '../../common/components/link_to/redirect_to_detection_engine';
import * as i18nRules from './translations';
import { SecurityPageName } from '../../app/types';
import { RULES_PATH } from '../../../common/constants';
import type { GetTrailingBreadcrumbs } from '../../common/components/navigation/breadcrumbs/types';
import { DELETED_RULE } from '../rule_details_ui/pages/rule_details/translations';

const getRuleDetailsTabName = (tabName: string): string => {
  return RULE_DETAILS_TAB_NAME[tabName] ?? RULE_DETAILS_TAB_NAME[RuleDetailTabs.alerts];
};

const isRuleCreatePage = (pathname: string) =>
  pathname.includes(RULES_PATH) && pathname.includes('/create');

const isRuleEditPage = (pathname: string) =>
  pathname.includes(RULES_PATH) && pathname.includes('/edit');

const isRuleChangesHistoryPage = (pathname: string) =>
  pathname.includes(RULES_PATH) && pathname.includes('/changes-history');

/**
 * This module should only export this function.
 * All the `getTrailingBreadcrumbs` functions in Security are loaded into the main bundle.
 * We should be careful to not import unnecessary modules in this file to avoid increasing the main app bundle size.
 */
export const getTrailingBreadcrumbs: GetTrailingBreadcrumbs = (params, getSecuritySolutionUrl) => {
  let breadcrumb: ChromeBreadcrumb[] = [];

  if (params.detailName && params.state?.ruleName) {
    breadcrumb = [
      ...breadcrumb,
      {
        text: params.state.ruleName,
        href: getSecuritySolutionUrl({
          deepLinkId: SecurityPageName.rules,
          path: getRuleDetailsUrl(params.detailName, ''),
        }),
      },
    ];
  }

  if (params.detailName && params.state?.ruleName && params.tabName) {
    breadcrumb = [
      ...breadcrumb,
      {
        text: getRuleDetailsTabName(params.tabName),
        href: getSecuritySolutionUrl({
          deepLinkId: SecurityPageName.rules,
          path: getRuleDetailsTabUrl(params.detailName, params.tabName, ''),
        }),
      },
    ];
  }

  if (isRuleCreatePage(params.pathName)) {
    breadcrumb = [
      ...breadcrumb,
      {
        text: i18nRules.ADD_PAGE_TITLE,
        href: '',
      },
    ];
  }

  if (isRuleEditPage(params.pathName) && params.detailName && params.state?.ruleName) {
    breadcrumb = [
      ...breadcrumb,
      {
        text: i18nRules.EDIT_PAGE_TITLE,
        href: '',
      },
    ];
  }

  if (isRuleChangesHistoryPage(params.pathName) && params.detailName && params.state?.ruleName) {
    breadcrumb = [
      ...breadcrumb,
      {
        text: i18nRules.RULE_CHANGES_HISTORY,
        href: '',
      },
    ];
  }

  if (
    !isRuleEditPage(params.pathName) &&
    !isRuleChangesHistoryPage(params.pathName) &&
    params.state &&
    !params.state.isExistingRule
  ) {
    breadcrumb = [...breadcrumb, { text: DELETED_RULE, href: '' }];
  }

  return breadcrumb;
};
