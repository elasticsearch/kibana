/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React from 'react';
import { of } from 'rxjs';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { Plugin } from '.';
import { createTopNav } from './top_nav_menu';

export type Setup = jest.Mocked<ReturnType<Plugin['setup']>>;
export type Start = jest.Mocked<ReturnType<Plugin['start']>>;

// mock mountPointPortal
jest.mock('@kbn/react-kibana-mount', () => {
  const original = jest.requireActual('@kbn/react-kibana-mount');
  return {
    ...original,
    MountPointPortal: jest.fn(({ children }) => children),
  };
});

const createSetupContract = (): jest.Mocked<Setup> => {
  const setupContract = {
    registerMenuItem: jest.fn(),
    registerNavigationExtension: jest.fn(),
  };

  return setupContract;
};

export const unifiedSearchMock = {
  ui: {
    SearchBar: () => <div className="searchBar" />,
    AggregateQuerySearchBar: () => <div className="searchBar" />,
  },
} as unknown as UnifiedSearchPublicPluginStart;

const createStartContract = (): jest.Mocked<Start> => {
  const startContract = {
    ui: {
      TopNavMenu: jest.fn().mockImplementation(createTopNav(unifiedSearchMock, [])),
      AggregateQueryTopNavMenu: jest.fn().mockImplementation(createTopNav(unifiedSearchMock, [])),
      createTopNavWithCustomContext: jest
        .fn()
        .mockImplementation(createTopNav(unifiedSearchMock, [])),
    },
    addSolutionNavigation: jest.fn(),
    isSolutionNavEnabled$: of(false),
  };
  return startContract;
};

export const navigationPluginMock = {
  createSetupContract,
  createStartContract,
};
