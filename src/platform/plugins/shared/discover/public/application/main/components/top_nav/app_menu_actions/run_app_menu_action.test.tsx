/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { discoverServiceMock } from '../../../../../__mocks__/services';
import { runAppMenuAction, enhanceAppMenuItemWithRunAction } from './run_app_menu_action';
import type { DiscoverAppMenuItemType, DiscoverAppMenuRunActionParams } from '@kbn/discover-utils';

describe('run app menu actions', () => {
  describe('runAppMenuAction', () => {
    it('should call the run function with correct params', async () => {
      let capturedParams: DiscoverAppMenuRunActionParams | undefined;
      const mockRun = jest.fn((params: DiscoverAppMenuRunActionParams) => {
        capturedParams = params;
      });
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        run: mockRun,
      };

      const anchorElement = document.createElement('div');

      await runAppMenuAction({
        appMenuItem,
        anchorElement,
        services: discoverServiceMock,
        returnFocus: jest.fn(),
      });

      expect(mockRun).toHaveBeenCalledTimes(1);

      if (!capturedParams) {
        throw new Error('Expected run params to be captured');
      }

      expect(capturedParams.triggerElement).toBe(anchorElement);
      expect(capturedParams.returnFocus).toEqual(expect.any(Function));
      expect(capturedParams.context).toEqual({ onFinishAction: expect.any(Function) });
    });

    it('should not render anything when only run is defined', async () => {
      const mockRun = jest.fn();
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        run: mockRun,
      };

      const anchorElement = document.createElement('div');

      await runAppMenuAction({
        appMenuItem,
        anchorElement,
        services: discoverServiceMock,
        returnFocus: jest.fn(),
      });

      expect(mockRun).toHaveBeenCalled();
      expect(document.body.querySelectorAll('div').length).toBe(0);
    });

    it('should render content returned from render', async () => {
      let capturedParams: DiscoverAppMenuRunActionParams | undefined;
      const mockRender = jest.fn((params: DiscoverAppMenuRunActionParams) => {
        capturedParams = params;
        return <div data-test-subj="test-content">Custom Content</div>;
      });
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        render: mockRender,
      };

      const anchorElement = document.createElement('div');
      document.body.appendChild(anchorElement);

      await runAppMenuAction({
        appMenuItem,
        anchorElement,
        services: discoverServiceMock,
        returnFocus: jest.fn(),
      });

      if (!capturedParams) {
        throw new Error('Expected render params to be captured');
      }

      expect(capturedParams.triggerElement).toBe(anchorElement);
      expect(capturedParams.returnFocus).toEqual(expect.any(Function));
      expect(capturedParams.context).toEqual({ onFinishAction: expect.any(Function) });
      expect(document.querySelector('[data-test-subj="test-content"]')).toBeInTheDocument();
    });

    it('should call onFinishAction to cleanup', async () => {
      let capturedParams: DiscoverAppMenuRunActionParams | undefined;

      const mockRender = jest.fn((params) => {
        capturedParams = params;
        return <div data-test-subj="test-content">Custom Content</div>;
      });

      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        render: mockRender,
      };

      const anchorElement = document.createElement('div');
      document.body.appendChild(anchorElement);
      const returnFocusMock = jest.fn();

      await runAppMenuAction({
        appMenuItem,
        anchorElement,
        services: discoverServiceMock,
        returnFocus: returnFocusMock,
      });

      expect(mockRender).toHaveBeenCalled();
      expect(capturedParams).toBeDefined();
      expect(capturedParams?.context.onFinishAction).toBeDefined();

      expect(document.querySelector('[data-test-subj="test-content"]')).toBeInTheDocument();

      const onFinishAction = capturedParams?.context?.onFinishAction;

      if (!onFinishAction) {
        throw new Error('Expected onFinishAction to be captured');
      }

      onFinishAction();

      expect(document.querySelector('[data-test-subj="test-content"]')).not.toBeInTheDocument();
      expect(returnFocusMock).toHaveBeenCalled();
    });
  });

  describe('enhanceAppMenuItemWithRunAction', () => {
    it('should wrap the run function', () => {
      const mockRun = jest.fn();
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        run: mockRun,
      };

      const enhanced = enhanceAppMenuItemWithRunAction({
        appMenuItem,
        services: discoverServiceMock,
      });

      expect(enhanced.run).toBeDefined();
      expect(enhanced.run).not.toBe(mockRun);
    });

    it('should wrap the render function', () => {
      const mockRender = jest.fn(() => null);
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        render: mockRender,
      };

      const enhanced = enhanceAppMenuItemWithRunAction({
        appMenuItem,
        services: discoverServiceMock,
      });

      expect(enhanced.run).toBeDefined();
      expect(enhanced.run).not.toBe(mockRender);
    });

    it('should call runAppMenuAction when wrapper is invoked', async () => {
      const mockRun = jest.fn();
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        testId: 'action-1',
        iconType: 'share',
        run: mockRun,
      };

      const enhanced = enhanceAppMenuItemWithRunAction({
        appMenuItem,
        services: discoverServiceMock,
      });

      const triggerElement = document.createElement('div');
      enhanced.run?.({
        triggerElement,
        returnFocus: jest.fn(),
        context: { onFinishAction: jest.fn() },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRun).toHaveBeenCalled();
    });

    it('should recursively enhance nested items', () => {
      const mockNestedRender = jest.fn(() => null);
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'parent',
        order: 1,
        label: 'Parent',
        iconType: 'folder',
        items: [
          {
            id: 'child',
            order: 1,
            label: 'Child',
            iconType: 'document',
            render: mockNestedRender,
          },
        ],
      };

      const enhanced = enhanceAppMenuItemWithRunAction({
        appMenuItem,
        services: discoverServiceMock,
      });

      expect(enhanced.items).toBeDefined();
      expect(enhanced.items?.[0]).toBeDefined();
      expect(enhanced.items?.[0].run).toBeDefined();
      expect(enhanced.items?.[0].run).not.toBe(mockNestedRender);
    });

    it('should preserve all properties', () => {
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 5,
        label: 'Action 1',
        iconType: 'share',
        testId: 'my-test-id',
        run: jest.fn(),
      };

      const enhanced = enhanceAppMenuItemWithRunAction({
        appMenuItem,
        services: discoverServiceMock,
      });

      expect(enhanced.id).toBe('action-1');
      expect(enhanced.order).toBe(5);
      expect(enhanced.label).toBe('Action 1');
      expect(enhanced.iconType).toBe('share');
      expect(enhanced.testId).toBe('my-test-id');
    });

    it('should return undefined run when item has no run or render', () => {
      const appMenuItem: DiscoverAppMenuItemType = {
        id: 'action-1',
        order: 1,
        label: 'Action 1',
        iconType: 'share',
        items: [],
      };

      const enhanced = enhanceAppMenuItemWithRunAction({
        appMenuItem,
        services: discoverServiceMock,
      });

      expect(enhanced.run).toBeUndefined();
    });
  });
});
