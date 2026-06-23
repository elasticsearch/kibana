/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { getMockNetflowData, TestProviders } from '../../../../../../common/mock';
import {
  eventActionMatches,
  eventCategoryMatches,
  netflowRowRenderer,
} from './netflow_row_renderer';
import { TimelineId } from '../../../../../../../common/types/timeline';

export const justIdAndTimestamp: Ecs = {
  _id: 'abcd',
  timestamp: '2018-11-12T19:03:25.936Z',
};

jest.mock('../../../../../../common/lib/kibana');
jest.mock('../../../../../../common/components/links/link_props');

describe('netflowRowRenderer', () => {
  test('renders key netflow fields from mock data', () => {
    const children = netflowRowRenderer.renderRow({
      data: getMockNetflowData(),
      scopeId: TimelineId.test,
    });

    render(<TestProviders>{children}</TestProviders>);

    expect(screen.getByText('192.168.1.2')).toBeInTheDocument(); // source.ip
    expect(screen.getByText('10.1.2.3')).toBeInTheDocument(); // destination.ip
    expect(screen.getByText('http')).toBeInTheDocument(); // network.protocol
    expect(screen.getByText('tcp')).toBeInTheDocument(); // network.transport
    expect(screen.getByText('we.live.in.a')).toBeInTheDocument(); // network.community_id
    expect(screen.getByText('rat')).toBeInTheDocument(); // process.name
    expect(screen.getByText('first.last')).toBeInTheDocument(); // user.name
  });

  describe('#isInstance', () => {
    test('it should return false if the data is not an instance that can be rendered', () => {
      expect(netflowRowRenderer.isInstance(justIdAndTimestamp)).toBe(false);
    });

    test('it should return true the data is an instance that can be rendered', () => {
      expect(netflowRowRenderer.isInstance(getMockNetflowData())).toBe(true);
    });
  });

  describe('#eventCategoryMatches', () => {
    test('it returns true when event.category is network_traffic', () => {
      expect(eventCategoryMatches('network_traffic')).toBe(true);
    });

    test('it returns false when event.category is NOT network_traffic', () => {
      expect(eventCategoryMatches('another category')).toBe(false);
    });

    test('it returns false when event.category is a random object', () => {
      expect(eventCategoryMatches({ random: true })).toBe(false);
    });

    test('it returns false when event.category is a undefined', () => {
      expect(eventCategoryMatches(undefined)).toBe(false);
    });

    test('it returns false when event.category is null', () => {
      expect(eventCategoryMatches(null)).toBe(false);
    });
  });

  describe('#eventActionMatches', () => {
    test('it returns true when event.action is network_flow', () => {
      expect(eventActionMatches('network_flow')).toBe(true);
    });

    test('it returns true when event.action is netflow_flow', () => {
      expect(eventActionMatches('netflow_flow')).toBe(true);
    });

    test('it returns false when event.action is NOT network_flow, netflow_flow, or socket_opened', () => {
      expect(eventActionMatches('another action')).toBe(false);
    });

    test('it returns false when event.action is a random object', () => {
      expect(eventActionMatches({ random: true })).toBe(false);
    });

    test('it returns false when event.action is a undefined', () => {
      expect(eventActionMatches(undefined)).toBe(false);
    });

    test('it returns false when event.action is null', () => {
      expect(eventActionMatches(null)).toBe(false);
    });
  });

  test('should render netflow data', () => {
    const children = netflowRowRenderer.renderRow({
      data: getMockNetflowData(),
      scopeId: TimelineId.test,
    });
    render(
      <TestProviders>
        <span>{children}</span>
      </TestProviders>
    );

    expect(screen.getByText('40B')).toBeInTheDocument();
  });
});
