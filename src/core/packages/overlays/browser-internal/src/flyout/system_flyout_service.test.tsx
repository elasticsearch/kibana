/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mockReactDomRender, mockReactDomUnmount } from '../overlay.test.mocks';
import { render } from '@testing-library/react';
import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { SystemFlyoutService } from './system_flyout_service';
import type { SystemFlyoutRef } from './system_flyout_ref';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import type { OverlaySystemFlyoutStart } from '@kbn/core-overlays-browser';
import React from 'react';

interface FlyoutManagerEvent {
  type: 'CLOSE_SESSION';
  session: {
    mainFlyoutId: string;
    childFlyoutId: string | null;
    childHistory?: Array<{ flyoutId: string; title: string }>;
  };
}

const eventListeners = new Set<(event: FlyoutManagerEvent) => void>();
const mockSubscribeToEvents = jest.fn((listener: (event: FlyoutManagerEvent) => void) => {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
});

const emitEvent = (event: FlyoutManagerEvent) => {
  eventListeners.forEach((listener) => listener(event));
};

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    getFlyoutManagerStore: jest.fn(() => ({ subscribeToEvents: mockSubscribeToEvents })),
  };
});

const analyticsMock = analyticsServiceMock.createAnalyticsServiceStart();
const i18nMock = i18nServiceMock.createStartContract();
const themeMock = themeServiceMock.createStartContract();
const userProfileMock = userProfileServiceMock.createStart();

beforeEach(() => {
  mockReactDomRender.mockClear();
  mockReactDomUnmount.mockClear();
  mockSubscribeToEvents.mockClear();
  eventListeners.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SystemFlyoutService', () => {
  let systemFlyouts: OverlaySystemFlyoutStart;
  let service: SystemFlyoutService;
  let targetDomElement: HTMLElement;
  let skipCleanup = false;

  beforeEach(() => {
    skipCleanup = false;
    service = new SystemFlyoutService();
    targetDomElement = document.createElement('div');
    systemFlyouts = service.start({
      analytics: analyticsMock,
      i18n: i18nMock,
      theme: themeMock,
      userProfile: userProfileMock,
      targetDomElement,
    });
  });

  afterEach(() => {
    if (!skipCleanup) {
      service.stop();
    }
  });

  describe('openSystemFlyout()', () => {
    it('pressing Back keeps the parent flyout open and closes the child flyout', () => {
      // When Back is pressed in a child flyout, EUI emits CLOSE_SESSION with the
      // parent as mainFlyoutId (destination) and the child as childFlyoutId (being removed).
      // A child opened in a separate React root (session='inherit') must be closed
      // explicitly via the subscription; EUI cannot reach across roots reliably.
      // The parent (session='start') must NOT be closed — it is the Back destination.
      const parentRef = systemFlyouts.open(<div>Parent flyout</div>, {
        id: 'parent-flyout',
        session: 'start',
      });
      const childRef = systemFlyouts.open(<div>Child flyout</div>, {
        id: 'child-flyout',
        session: 'inherit',
      });

      emitEvent({
        type: 'CLOSE_SESSION',
        session: { mainFlyoutId: 'parent-flyout', childFlyoutId: 'child-flyout' },
      });

      // Child (session='inherit') is explicitly closed by the subscription
      expect((childRef as SystemFlyoutRef).isClosed).toBe(true);
      // Parent (session='start') stays open — it is the Back destination.
      // EUI calls the onClose prop if the whole session later ends; we don't close it here.
      expect((parentRef as SystemFlyoutRef).isClosed).toBe(false);
      expect(mockReactDomUnmount).toHaveBeenCalledTimes(1);
    });

    it('closing the top flyout also closes child flyouts in the session', () => {
      // Closing the top flyout ends the entire session. EUI emits CLOSE_SESSION with
      // the same structure as Back (mainFlyoutId = parent, childFlyoutId = child).
      // The child flyout in its separate React root must be closed via the subscription.
      // The parent flyout (session='start') is closed by EUI via the onClose prop.
      const parentRef = systemFlyouts.open(<div>Parent flyout</div>, {
        id: 'parent-flyout',
        session: 'start',
      });
      const childRef = systemFlyouts.open(<div>Child flyout</div>, {
        id: 'child-flyout',
        session: 'inherit',
      });

      emitEvent({
        type: 'CLOSE_SESSION',
        session: { mainFlyoutId: 'parent-flyout', childFlyoutId: 'child-flyout' },
      });

      expect((childRef as SystemFlyoutRef).isClosed).toBe(true);
      expect(mockReactDomUnmount).toHaveBeenCalledTimes(1);
      // Parent closing is handled by EUI via onClose — not by our subscription
      expect((parentRef as SystemFlyoutRef).isClosed).toBe(false);
    });

    it('closes child flyouts in childHistory when the session ends', () => {
      // When a session has navigated through multiple child flyouts, the previous
      // children are tracked in childHistory. All of them must be closed when the
      // session ends, not just the currently active child.
      const parentRef = systemFlyouts.open(<div>Parent</div>, {
        id: 'parent-flyout-demo',
        session: 'start',
      });
      const child1Ref = systemFlyouts.open(<div>Child 1</div>, {
        id: 'child-flyout-demo-1',
        session: 'inherit',
      });
      const child2Ref = systemFlyouts.open(<div>Child 2</div>, {
        id: 'child-flyout-demo-2',
        session: 'inherit',
      });

      expect(mockReactDomUnmount).not.toHaveBeenCalled();

      emitEvent({
        type: 'CLOSE_SESSION',
        session: {
          mainFlyoutId: 'parent-flyout-demo',
          childFlyoutId: 'child-flyout-demo-2',
          childHistory: [{ flyoutId: 'child-flyout-demo-1', title: 'Child 1' }],
        },
      });

      // Both child flyouts are closed: child2 via childFlyoutId, child1 via childHistory
      expect((child1Ref as SystemFlyoutRef).isClosed).toBe(true);
      expect((child2Ref as SystemFlyoutRef).isClosed).toBe(true);
      expect(mockReactDomUnmount).toHaveBeenCalledTimes(2);
      // Parent (session='start') is closed by EUI via onClose, not our subscription
      expect((parentRef as SystemFlyoutRef).isClosed).toBe(false);
    });

    it('pressing Back to return to Session X does not close Session X (regression)', () => {
      // Regression: with Session X and Session Y both open, pressing Back in Session Y
      // emits CLOSE_SESSION with Session X as mainFlyoutId (destination) and
      // Session Y as childFlyoutId (being removed). The old code closed any flyout
      // whose ID matched mainFlyoutId OR childFlyoutId, which incorrectly closed
      // Session X — the flyout the user was navigating back TO.
      const refX = systemFlyouts.open(<div>Session X</div>, { id: 'session-x', session: 'start' });
      const refY = systemFlyouts.open(<div>Session Y</div>, { id: 'session-y', session: 'start' });

      // Back in Session Y: session-x is where we are going, session-y is being closed
      emitEvent({
        type: 'CLOSE_SESSION',
        session: { mainFlyoutId: 'session-x', childFlyoutId: 'session-y' },
      });

      // Session X must remain open — it is the Back destination
      expect((refX as SystemFlyoutRef).isClosed).toBe(false);
      // Session Y is handled by EUI via onClose; our subscription does not close it
      expect((refY as SystemFlyoutRef).isClosed).toBe(false);
      expect(mockReactDomUnmount).not.toHaveBeenCalled();
    });

    it('pressing Back from child2 to child1 does not close child1', () => {
      // When navigating from child1 to child2 and then pressing Back, EUI fires
      // CLOSE_SESSION with child2 as childFlyoutId (being removed) and no entry for
      // child1 in childHistory (child1 is the destination, not a flyout being closed).
      // This verifies our childHistory check does not accidentally close the Back destination.
      const child1Ref = systemFlyouts.open(<div>Child 1</div>, {
        id: 'child-flyout-1',
        session: 'inherit',
      });
      const child2Ref = systemFlyouts.open(<div>Child 2</div>, {
        id: 'child-flyout-2',
        session: 'inherit',
      });

      // Back in child2: child2 is removed, child1 is the destination (not in childHistory)
      emitEvent({
        type: 'CLOSE_SESSION',
        session: {
          mainFlyoutId: 'parent-flyout',
          childFlyoutId: 'child-flyout-2',
          childHistory: [],
        },
      });

      expect((child2Ref as SystemFlyoutRef).isClosed).toBe(true);
      expect((child1Ref as SystemFlyoutRef).isClosed).toBe(false);
      expect(mockReactDomUnmount).toHaveBeenCalledTimes(1);
    });

    it('does not close a child flyout when a different session ends', () => {
      const childRef = systemFlyouts.open(<div>Child flyout</div>, {
        id: 'child-flyout',
        session: 'inherit',
      });

      emitEvent({
        type: 'CLOSE_SESSION',
        session: { mainFlyoutId: 'unrelated-parent', childFlyoutId: 'unrelated-child' },
      });

      expect((childRef as SystemFlyoutRef).isClosed).toBe(false);
      expect(mockReactDomUnmount).not.toHaveBeenCalled();
    });

    it('renders a system flyout to the DOM', () => {
      expect(mockReactDomRender).not.toHaveBeenCalled();
      systemFlyouts.open(<div>System flyout content</div>);
      expect(mockReactDomRender).toHaveBeenCalledTimes(1);

      // Verify the render was called with React element
      const [renderedElement, container] = mockReactDomRender.mock.calls[0];
      expect(renderedElement).toBeDefined();
      expect(container).toBeDefined();
    });

    it('renders with default session="start"', () => {
      systemFlyouts.open(<div>System flyout content</div>);
      expect(mockReactDomRender).toHaveBeenCalledTimes(1);

      const { container } = render(mockReactDomRender.mock.calls[0][0]);
      expect(container.querySelector('[data-eui="EuiFlyout"]')).toBeTruthy();
    });

    it('renders with custom title at the top level', () => {
      systemFlyouts.open(<div>System flyout content</div>, {
        title: 'Top Level Title',
      });
      expect(mockReactDomRender).toHaveBeenCalledTimes(1);

      // Verify the title was passed through
      const renderedElement = mockReactDomRender.mock.calls[0][0];
      const euiFlyoutElement = renderedElement.props.children;
      expect(euiFlyoutElement.props.flyoutMenuProps.title).toBe('Top Level Title');
    });

    it('renders flyoutMenuProps with custom properties', () => {
      const expectedFlyoutMenuProps = {
        title: 'Visible Title',
        'data-test-subj': 'test-menu',
        hideTitle: false,
      };

      systemFlyouts.open(<div>System flyout content</div>, {
        flyoutMenuProps: expectedFlyoutMenuProps,
      });
      expect(mockReactDomRender).toHaveBeenCalledTimes(1);

      // Navigate to the actual EuiFlyout component to check its props
      const renderedElement = mockReactDomRender.mock.calls[0][0];
      // The structure is: KibanaRenderContextProvider > EuiFlyout
      const euiFlyoutElement = renderedElement.props.children;
      expect(euiFlyoutElement.props.flyoutMenuProps).toEqual(expectedFlyoutMenuProps);
    });

    it('gives precedence to flyoutMenuProps.title over top-level title', () => {
      systemFlyouts.open(<div>System flyout content</div>, {
        title: 'Top Level Title',
        flyoutMenuProps: { title: 'Menu Title', 'data-test-subj': 'test-menu' },
      });
      expect(mockReactDomRender).toHaveBeenCalledTimes(1);

      // Verify that flyoutMenuProps.title takes precedence
      const renderedElement = mockReactDomRender.mock.calls[0][0];
      const euiFlyoutElement = renderedElement.props.children;
      expect(euiFlyoutElement.props.flyoutMenuProps.title).toBe('Menu Title');
    });

    it('applies additional EuiFlyout options', () => {
      systemFlyouts.open(<div>System flyout content</div>, {
        size: 'l',
        maxWidth: 800,
        type: 'overlay',
        'aria-label': 'Custom Flyout',
      });
      expect(mockReactDomRender).toHaveBeenCalledTimes(1);

      const { container } = render(mockReactDomRender.mock.calls[0][0]);
      const flyout = container.querySelector('[data-eui="EuiFlyout"]');
      expect(flyout).toBeTruthy();
      // Verify the flyout was rendered with the options
      expect(mockReactDomRender.mock.calls[0][0]).toBeDefined();
    });

    it('returns an OverlayRef', () => {
      const ref = systemFlyouts.open(<div>System flyout content</div>);
      expect(ref).toHaveProperty('close');
      expect(ref).toHaveProperty('onClose');
      expect(ref.onClose).toBeInstanceOf(Promise);
    });

    it('accepts a custom onClose handler', async () => {
      const onClose = jest.fn();
      const ref = systemFlyouts.open(<div>System flyout content</div>, {
        onClose,
      });
      const refClosed = jest.fn();
      ref.onClose.then(refClosed);

      const euiFlyoutElement = mockReactDomRender.mock.calls[0][0].props.children;
      euiFlyoutElement.props.onClose();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith();

      await ref.onClose;
      expect(refClosed).toHaveBeenCalledTimes(1);
    });

    describe('with multiple active flyouts', () => {
      let ref1: OverlayRef;
      let ref2: OverlayRef;

      beforeEach(() => {
        ref1 = systemFlyouts.open(<div>Flyout 1</div>);
        ref2 = systemFlyouts.open(<div>Flyout 2</div>);
      });

      it('allows multiple flyouts to be open simultaneously', () => {
        expect(mockReactDomRender).toHaveBeenCalledTimes(2);
      });

      it('closes flyouts independently', async () => {
        const onClose1 = jest.fn();
        const onClose2 = jest.fn();
        ref1.onClose.then(onClose1);
        ref2.onClose.then(onClose2);

        await ref1.close();
        expect(onClose1).toHaveBeenCalledTimes(1);
        expect(onClose2).not.toHaveBeenCalled();

        await ref2.close();
        expect(onClose2).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('FlyoutRef#close()', () => {
    it('resolves the onClose Promise', async () => {
      const ref = systemFlyouts.open(<div>System flyout content</div>);

      const onCloseComplete = jest.fn();
      ref.onClose.then(onCloseComplete);
      await ref.close();
      await ref.close();
      expect(onCloseComplete).toHaveBeenCalledTimes(1);
    });

    it('can be called multiple times on the same FlyoutRef', async () => {
      const ref = systemFlyouts.open(<div>System flyout content</div>);
      expect(mockReactDomUnmount).not.toHaveBeenCalled();

      const firstClose = await ref.close();
      const secondClose = await ref.close();

      // Both should return the same promise
      expect(firstClose).toBe(secondClose);
      // Unmount should only be called once total
      expect(mockReactDomUnmount).toHaveBeenCalledTimes(1);
    });

    it('removes the flyout container from the DOM', async () => {
      const targetElement = document.createElement('div');
      const testService = new SystemFlyoutService();
      const flyouts = testService.start({
        analytics: analyticsMock,
        i18n: i18nMock,
        theme: themeMock,
        userProfile: userProfileMock,
        targetDomElement: targetElement,
      });

      const ref = flyouts.open(<div>System flyout content</div>);
      expect(targetElement.children.length).toBe(1);

      await ref.close();
      expect(targetElement.children.length).toBe(0);

      testService.stop();
    });
  });

  describe('closeAllFlyouts()', () => {
    it('closes all active flyouts', () => {
      systemFlyouts.open(<div>Flyout 1</div>);
      systemFlyouts.open(<div>Flyout 2</div>);

      expect(targetDomElement.children.length).toBe(2);
      mockReactDomUnmount.mockClear();

      service.closeAllFlyouts();

      expect(mockReactDomUnmount).toHaveBeenCalledTimes(2);
      expect(targetDomElement.children.length).toBe(0);
    });

    it('is a no-op when no flyouts are open', () => {
      expect(() => service.closeAllFlyouts()).not.toThrow();
      expect(mockReactDomUnmount).not.toHaveBeenCalled();
    });

    it('allows new flyouts to be opened after closing all', () => {
      systemFlyouts.open(<div>Flyout 1</div>);
      service.closeAllFlyouts();

      expect(() => systemFlyouts.open(<div>Flyout 2</div>)).not.toThrow();
      expect(targetDomElement.children.length).toBe(1);
    });
  });

  describe('stop()', () => {
    it('closes all active flyouts', () => {
      skipCleanup = true;
      const testService = new SystemFlyoutService();
      const testTarget = document.createElement('div');
      const flyouts = testService.start({
        analytics: analyticsMock,
        i18n: i18nMock,
        theme: themeMock,
        userProfile: userProfileMock,
        targetDomElement: testTarget,
      });

      flyouts.open(<div>Flyout 1</div>);
      flyouts.open(<div>Flyout 2</div>);

      expect(testTarget.children.length).toBe(2);

      // Clear mocks to count only unmounts from this service
      mockReactDomUnmount.mockClear();

      testService.stop();

      // All flyouts should be unmounted
      expect(mockReactDomUnmount).toHaveBeenCalledTimes(2);
      expect(testTarget.children.length).toBe(0);
    });

    it('clears the targetDomElement reference', () => {
      const testService = new SystemFlyoutService();
      const targetElement = document.createElement('div');
      testService.start({
        analytics: analyticsMock,
        i18n: i18nMock,
        theme: themeMock,
        userProfile: userProfileMock,
        targetDomElement: targetElement,
      });

      testService.stop();

      // After stop, the service should have cleared its reference
      expect(() => {
        testService.start({
          analytics: analyticsMock,
          i18n: i18nMock,
          theme: themeMock,
          userProfile: userProfileMock,
          targetDomElement: targetElement,
        });
      }).not.toThrow();

      testService.stop();
    });
  });
});
