/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ApplicationStart } from '@kbn/core/public';
import {
  getWorkflowDetailRouteState,
  getWorkflowsListPathFromDetailRouteState,
  navigateToWorkflowsList,
} from './workflow_navigation';
import { PLUGIN_ID } from '../../../common';

describe('workflow navigation', () => {
  it('builds detail route state with the current workflows list search params', () => {
    expect(getWorkflowDetailRouteState('?tags=prod&enabled=true')).toEqual({
      workflowsListSearch: '?tags=prod&enabled=true',
    });
  });

  it('omits detail route state when the workflows list has no search params', () => {
    expect(getWorkflowDetailRouteState('')).toBeUndefined();
  });

  it('restores the workflows list path from detail route state', () => {
    expect(
      getWorkflowsListPathFromDetailRouteState({
        workflowsListSearch: '?tags=prod&enabled=true',
      })
    ).toBe('?tags=prod&enabled=true');
  });

  it('returns undefined when the detail route state has no workflows list search params', () => {
    expect(getWorkflowsListPathFromDetailRouteState(undefined)).toBeUndefined();
  });

  it('navigates back to the workflows list with stored search params', async () => {
    const application = {
      navigateToApp: jest.fn().mockResolvedValue(undefined),
    };

    await navigateToWorkflowsList(application as unknown as ApplicationStart, {
      workflowsListSearch: '?tags=prod&enabled=true',
    });

    expect(application.navigateToApp).toHaveBeenCalledWith(PLUGIN_ID, {
      path: '?tags=prod&enabled=true',
    });
  });

  it('navigates back to the default workflows list without stored search params', async () => {
    const application = {
      navigateToApp: jest.fn().mockResolvedValue(undefined),
    };

    await navigateToWorkflowsList(application as unknown as ApplicationStart, undefined);

    expect(application.navigateToApp).toHaveBeenCalledWith(PLUGIN_ID, undefined);
  });
});
