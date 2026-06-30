/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { RuleTypeParams } from '@kbn/alerting-types';
import { getRuleDetailsRoute, triggersActionsRoute } from '@kbn/rule-data-utils';
import { getSpaceUrlPrefix, type SpaceId } from '@kbn/core-spaces-common';
import type { GetViewInAppRelativeUrlFn } from '../../../types';
import type { ActionSchedulerRule } from '../types';

interface BuildRuleUrlOpts<Params extends RuleTypeParams> {
  end?: number;
  getViewInAppRelativeUrl?: GetViewInAppRelativeUrlFn<Params>;
  kibanaBaseUrl: string | undefined;
  logger: Logger;
  rule: ActionSchedulerRule<Params>;
  spaceId: SpaceId;
  start?: number;
}

interface BuildRuleUrlResult {
  absoluteUrl: string;
  basePathname: string;
  kibanaBaseUrl: string;
  relativePath: string;
  spaceIdSegment: string;
}

export const buildRuleUrl = <Params extends RuleTypeParams>(
  opts: BuildRuleUrlOpts<Params>
): BuildRuleUrlResult | undefined => {
  if (!opts.kibanaBaseUrl) {
    return;
  }

  const relativePath = opts.getViewInAppRelativeUrl
    ? opts.getViewInAppRelativeUrl({ rule: opts.rule, start: opts.start, end: opts.end })
    : `${triggersActionsRoute}${getRuleDetailsRoute(opts.rule.id)}`;

  try {
    const basePathname = new URL(opts.kibanaBaseUrl).pathname;
    const basePathnamePrefix = basePathname !== '/' ? `${basePathname}` : '';
    const spaceIdSegment = getSpaceUrlPrefix(opts.spaceId);

    const ruleUrl = new URL(
      [basePathnamePrefix, spaceIdSegment, relativePath].join(''),
      opts.kibanaBaseUrl
    );

    return {
      absoluteUrl: ruleUrl.toString(),
      kibanaBaseUrl: opts.kibanaBaseUrl,
      basePathname: basePathnamePrefix,
      spaceIdSegment,
      relativePath,
    };
  } catch (error) {
    opts.logger.debug(
      `Rule "${opts.rule.id}" encountered an error while constructing the rule.url variable: ${error.message}`
    );
    return;
  }
};
