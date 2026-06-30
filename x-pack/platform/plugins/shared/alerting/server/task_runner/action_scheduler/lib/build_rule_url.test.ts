/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { asSpaceId } from '@kbn/core-spaces-common';
import { buildRuleUrl } from './build_rule_url';
import { getRule } from '../test_fixtures';

const logger = loggingSystemMock.create().get();
const rule = getRule();

describe('buildRuleUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return undefined if kibanaBaseUrl is not provided', () => {
    expect(
      buildRuleUrl({
        kibanaBaseUrl: undefined,
        logger,
        rule,
        spaceId: asSpaceId('default'),
      })
    ).toBeUndefined();
  });

  test('should return the expected URL', () => {
    expect(
      buildRuleUrl({
        kibanaBaseUrl: 'http://localhost:5601',
        logger,
        rule,
        spaceId: asSpaceId('default'),
      })
    ).toEqual({
      absoluteUrl:
        'http://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/1',
      basePathname: '',
      kibanaBaseUrl: 'http://localhost:5601',
      relativePath: '/app/management/insightsAndAlerting/triggersActions/rule/1',
      spaceIdSegment: '',
    });
  });

  test('should return the expected URL for custom space', () => {
    expect(
      buildRuleUrl({
        kibanaBaseUrl: 'http://localhost:5601',
        logger,
        rule,
        spaceId: asSpaceId('my-special-space'),
      })
    ).toEqual({
      absoluteUrl:
        'http://localhost:5601/s/my-special-space/app/management/insightsAndAlerting/triggersActions/rule/1',
      basePathname: '',
      kibanaBaseUrl: 'http://localhost:5601',
      relativePath: '/app/management/insightsAndAlerting/triggersActions/rule/1',
      spaceIdSegment: '/s/my-special-space',
    });
  });

  test('should return the expected URL when getViewInAppRelativeUrl is defined', () => {
    expect(
      buildRuleUrl({
        getViewInAppRelativeUrl: ({ rule: r }) => `/app/test/my-custom-rule-page/${r.id}`,
        kibanaBaseUrl: 'http://localhost:5601',
        logger,
        rule,
        spaceId: asSpaceId('default'),
      })
    ).toEqual({
      absoluteUrl: 'http://localhost:5601/app/test/my-custom-rule-page/1',
      basePathname: '',
      kibanaBaseUrl: 'http://localhost:5601',
      relativePath: '/app/test/my-custom-rule-page/1',
      spaceIdSegment: '',
    });
  });

  test('should return the expected URL when start, end and getViewInAppRelativeUrl is defined', () => {
    expect(
      buildRuleUrl({
        end: 987654321,
        getViewInAppRelativeUrl: ({ rule: r, start: s, end: e }) =>
          `/app/test/my-custom-rule-page/${r.id}?start=${s}&end=${e}`,
        kibanaBaseUrl: 'http://localhost:5601',
        logger,
        rule,
        start: 123456789,
        spaceId: asSpaceId('default'),
      })
    ).toEqual({
      absoluteUrl:
        'http://localhost:5601/app/test/my-custom-rule-page/1?start=123456789&end=987654321',
      basePathname: '',
      kibanaBaseUrl: 'http://localhost:5601',
      relativePath: '/app/test/my-custom-rule-page/1?start=123456789&end=987654321',
      spaceIdSegment: '',
    });
  });

  test('should return the expected URL when start and end are defined but getViewInAppRelativeUrl is undefined', () => {
    expect(
      buildRuleUrl({
        end: 987654321,
        kibanaBaseUrl: 'http://localhost:5601',
        logger,
        rule,
        start: 123456789,
        spaceId: asSpaceId('default'),
      })
    ).toEqual({
      absoluteUrl:
        'http://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/1',
      basePathname: '',
      kibanaBaseUrl: 'http://localhost:5601',
      relativePath: '/app/management/insightsAndAlerting/triggersActions/rule/1',
      spaceIdSegment: '',
    });
  });

  test('should return undefined if base url is invalid', () => {
    expect(
      buildRuleUrl({
        kibanaBaseUrl: 'foo-url',
        logger,
        rule,
        spaceId: asSpaceId('default'),
      })
    ).toBeUndefined();

    expect(logger.debug).toHaveBeenCalledWith(
      `Rule "1" encountered an error while constructing the rule.url variable: Invalid URL: foo-url`
    );
  });
});
