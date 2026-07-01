/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import React from 'react';
import * as stories from './service_link.stories';

const { Example, AndroidAgent, IOSAgent } = composeStories(stories);

const params =
  'anomalyThreshold=major&comparisonEnabled=false&environment=ENVIRONMENT_ALL&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup=';
describe('ServiceLink', () => {
  it('links to service details', async () => {
    expect(() => render(<Example />)).not.toThrowError();

    expect(await screen.findByTestId('serviceLink_java')).toHaveAttribute(
      'href',
      `/basepath/app/apm/services/opbeans-java/overview?${params}`
    );
  });

  it('links to mobile service details', async () => {
    expect(() => render(<AndroidAgent />)).not.toThrowError();
    expect(() => render(<IOSAgent />)).not.toThrowError();

    expect(await screen.findByTestId('serviceLink_android/java')).toHaveAttribute(
      'href',
      `/basepath/app/apm/mobile-services/opbeans-android/overview?${params}`
    );

    expect(await screen.findByTestId('serviceLink_iOS/swift')).toHaveAttribute(
      'href',
      `/basepath/app/apm/mobile-services/opbeans-swift/overview?${params}`
    );
  });
});
