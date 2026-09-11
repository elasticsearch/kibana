/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Matcher, SelectorMatcherOptions } from '@testing-library/react';
import { within } from '@testing-library/react';
import React from 'react';
import { render, WrappedHelper } from '../../../utils/testing';
import type { JourneyStep } from '../../../../../../common/runtime_types';
import { BrowserStepsList } from './browser_steps_list';

const SCREENSHOT_COLUMN_HEADER = 'Screenshot';

describe('<BrowserStepsList />', () => {
  let steps: JourneyStep[] = [];

  it('renders step data and pre-expands when using pre-fetched data', () => {
    const { getByText } = render(
      <BrowserStepsList steps={steps} loading={false} showStepNumber={true} />
    );

    assertErrorIsExpanded(getByText);
  });

  it('renders the Screenshot column by default (browser monitors)', () => {
    const { queryByText } = render(
      <BrowserStepsList steps={steps} loading={false} showStepNumber={true} />
    );

    expect(queryByText(SCREENSHOT_COLUMN_HEADER)).not.toBeNull();
  });

  it('omits the Screenshot column when showScreenshots is false (API monitors)', () => {
    const { queryByText } = render(
      <BrowserStepsList
        steps={steps}
        loading={false}
        showStepNumber={true}
        showScreenshots={false}
      />
    );

    expect(queryByText(SCREENSHOT_COLUMN_HEADER)).toBeNull();
  });

  it('renders step data and pre-expands after loading completes', () => {
    const { rerender, getByText } = render(
      <BrowserStepsList steps={[]} loading={true} showStepNumber={true} />
    );

    expect(getByText('Loading steps...'));

    rerender(
      <WrappedHelper>
        <BrowserStepsList steps={steps} loading={false} showStepNumber={true} />
      </WrappedHelper>
    );

    assertErrorIsExpanded(getByText);
  });

  function assertErrorIsExpanded(
    getByText: (id: Matcher, options?: SelectorMatcherOptions) => HTMLElement
  ) {
    const passNode = getByText('pass');
    const passRow = passNode.closest('tr');
    expect(passRow).not.toBeNull();
    const passUtils = within(passRow!);
    expect(passUtils.getByLabelText('Expand'));

    const failNode = getByText('fail');
    const failRow = failNode.closest('tr');
    expect(failRow).not.toBeNull();
    const failUtils = within(failRow!);
    expect(failUtils.getByLabelText('Collapse'));
  }

  beforeEach(() => {
    steps = [
      {
        _id: 'ulfZrIkBgED7L_98fYgN',
        synthetics: {
          package_version: '1.0.0',
          journey: {
            name: 'inline',
            id: 'inline',
          },
          payload: {
            source: "() => page.goto('https://elastic.co')",
            url: 'https://elastic.co/',
            status: 'succeeded',
          },
          index: 12,
          step: {
            duration: {
              us: 9836995,
            },
            name: 'pass',
            index: 1,
            status: 'succeeded',
          },
          type: 'step/end',
          isFullScreenshot: false,
          isScreenshotRef: true,
        },
        monitor: {
          name: 'fail 2nd',
          id: '86dbbb01-b087-46b2-81f4-dfa5b1714f91',
          timespan: {
            lt: '2023-07-31T16:58:00.731Z',
            gte: '2023-07-31T16:48:00.731Z',
          },
          check_group: 'fbe02469-2fc1-11ee-8782-fabe9948d28f',
          type: 'browser',
        },
        observer: {
          geo: {
            name: 'North America - US Central',
            location: '41.8780, 93.0977',
          },
          name: 'us_central',
        },
        '@timestamp': '2023-07-31T16:48:00.729Z',
        config_id: '86dbbb01-b087-46b2-81f4-dfa5b1714f91',
      },
      {
        _id: 'u1fZrIkBgED7L_98fYgN',
        synthetics: {
          package_version: '1.0.0',
          journey: {
            name: 'inline',
            id: 'inline',
          },
          payload: {
            source: "() => {throw Error('fail now plz')}",
            url: 'https://www.elastic.co/',
            status: 'failed',
          },
          index: 13,
          step: {
            duration: {
              us: 413593,
            },
            name: 'fail',
            index: 2,
            status: 'failed',
          },
          error: {
            stack:
              'Error: fail now plz\n    at Step.eval [as callback] (eval at loadInlineScript (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/loader.ts:86:20), <anonymous>:4:27)\n    at Runner.runStep (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:212:18)\n    at Runner.runSteps (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:262:16)\n    at Runner.runJourney (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:352:27)\n    at Runner.run (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:445:11)\n    at Command.<anonymous> (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/cli.ts:136:23)',
            name: 'Error',
            message: 'fail now plz',
          },
          type: 'step/end',
          isFullScreenshot: false,
          isScreenshotRef: true,
        },
        monitor: {
          name: 'fail 2nd',
          timespan: {
            lt: '2023-07-31T16:58:01.144Z',
            gte: '2023-07-31T16:48:01.144Z',
          },
          check_group: 'fbe02469-2fc1-11ee-8782-fabe9948d28f',
          id: '86dbbb01-b087-46b2-81f4-dfa5b1714f91',
          type: 'browser',
        },
        error: {
          message: 'error executing step: fail now plz',
        },
        observer: {
          geo: {
            name: 'North America - US Central',
            location: '41.8780, 93.0977',
          },
          name: 'us_central',
        },
        '@timestamp': '2023-07-31T16:48:01.143Z',
        config_id: '86dbbb01-b087-46b2-81f4-dfa5b1714f91',
      },
    ];
  });
});
