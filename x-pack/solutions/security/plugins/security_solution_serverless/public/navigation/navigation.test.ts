/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { WORKFLOWS_UI_SETTING_ID } from '@kbn/workflows/common/constants';
import type { ProductLine, ProductTier } from '../../common/product';
import { mockServices } from '../common/services/__mocks__/services.mock';
import { registerSolutionNavigation } from './navigation';
import { createNavigationTree } from './navigation_tree';
import { createAiNavigationTree } from './ai_navigation/ai_navigation_tree';

jest.mock('./navigation_tree');
jest.mock('./ai_navigation/ai_navigation_tree');

const mockedCreateNavigationTree = createNavigationTree as jest.Mock;
const mockedCreateAiNavigationTree = createAiNavigationTree as jest.Mock;

const mockedNavTree = {};
mockedCreateNavigationTree.mockResolvedValue(mockedNavTree);
const mockedAiNavTree = {};
mockedCreateAiNavigationTree.mockReturnValue(mockedAiNavTree);

describe('Security Side Nav', () => {
  const services = mockServices;
  const initNavigationSpy = jest.spyOn(services.serverless, 'initNavigation');

  beforeEach(() => {
    jest.clearAllMocks();
    initNavigationSpy.mockReset();
    services.settings.client.get$ = jest.fn().mockImplementation((key: string) => {
      if (key === WORKFLOWS_UI_SETTING_ID) {
        return of(false);
      }

      return of(AIChatExperience.Classic);
    });
  });

  it('registers the navigation tree definition for serverless security', async () => {
    expect(initNavigationSpy).not.toHaveBeenCalled();

    await registerSolutionNavigation(services, []);

    expect(initNavigationSpy).toHaveBeenCalled();
    expect(mockedCreateNavigationTree).toHaveBeenCalledWith(services, AIChatExperience.Classic);
    expect(mockedCreateAiNavigationTree).not.toHaveBeenCalled();

    const [, navigationTree$] = initNavigationSpy.mock.calls[0];

    navigationTree$.subscribe({
      next: (value) => {
        expect(value).toBe(mockedNavTree);
      },
    });
  });

  it('registers the navigation tree definition for serverless security with AI SOC', async () => {
    expect(initNavigationSpy).not.toHaveBeenCalled();

    await registerSolutionNavigation(services, [
      {
        product_line: 'ai_soc' as ProductLine,
        product_tier: 'search_ai_lake' as ProductTier,
      },
    ]);

    expect(initNavigationSpy).toHaveBeenCalled();
    expect(mockedCreateAiNavigationTree).toHaveBeenCalledWith(
      services,
      AIChatExperience.Classic,
      false,
      false
    );
    expect(mockedCreateNavigationTree).not.toHaveBeenCalled();

    const [, navigationTree$] = initNavigationSpy.mock.calls[0];

    navigationTree$.subscribe({
      next: (value) => {
        expect(value).toBe(mockedAiNavTree);
      },
    });
  });

  it('passes Agent chat experience when settings return Agent', async () => {
    services.settings.client.get$ = jest.fn().mockImplementation((key: string) => {
      if (key === WORKFLOWS_UI_SETTING_ID) {
        return of(false);
      }

      return of(AIChatExperience.Agent);
    });

    await registerSolutionNavigation(services, []);

    expect(mockedCreateNavigationTree).toHaveBeenCalledWith(services, AIChatExperience.Agent);
  });

  it('passes workflows UI enabled true when settings return true', async () => {
    services.settings.client.get$ = jest.fn().mockImplementation((key: string) => {
      if (key === WORKFLOWS_UI_SETTING_ID) {
        return of(true);
      }

      return of(AIChatExperience.Classic);
    });

    await registerSolutionNavigation(services, [
      {
        product_line: 'ai_soc' as ProductLine,
        product_tier: 'search_ai_lake' as ProductTier,
      },
    ]);

    expect(mockedCreateAiNavigationTree).toHaveBeenCalledWith(
      services,
      AIChatExperience.Classic,
      true,
      false
    );
  });
});
