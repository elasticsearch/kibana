/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';

import { DeveloperToolbar, type DeveloperToolbarProps } from '../components/developer_toolbar';
import { DeveloperToolbarItem } from '../components/developer_toolbar_item';
import type { EnvironmentInfo } from '../toolbar_items/environment/environment_indicator';

const mockEnvInfo: EnvironmentInfo = {
  mode: {
    name: 'development',
    dev: true,
    prod: false,
  },
  packageInfo: {
    version: '8.15.0',
    branch: 'main',
    buildNum: 12345,
    buildSha: 'abcd1234567890abcd1234567890abcd12345678',
    buildShaShort: 'abcd123',
    buildDate: new Date('2024-08-19T10:30:00.000Z'),
    buildFlavor: 'traditional',
    dist: false,
  },
};

const DeveloperToolbarWrapper = (props: DeveloperToolbarProps) => {
  const triggerError = () => {
    // eslint-disable-next-line no-console
    console.error('This is a test console error from the developer toolbar demo');
  };

  const triggerWarning = () => {
    // eslint-disable-next-line no-console
    console.warn('This is a test console warning with %s formatting', 'React-style');
  };

  const triggerStackTraceTest = () => {
    // Test that stack traces are preserved - this should show line 51 in DevTools
    // eslint-disable-next-line no-console
    console.error('Stack trace preservation test - should show this line number in DevTools');
  };

  const triggerException = () => {
    throw new Error('This is a test exception thrown from the developer toolbar demo');
  };

  const simulateMemoryLeak = () => {
    const leakyArray: unknown[] = [];
    setInterval(() => {
      // Simulate memory leak by adding data without cleanup
      for (let i = 0; i < 1000; i++) {
        leakyArray.push(new Array(1000).fill('leak'));
      }
    }, 100);
  };

  const simulateFrameJank = () => {
    // Block the main thread to simulate jank
    const start = performance.now();
    while (performance.now() - start < 200) {
      // Busy wait to create frame drops
    }
  };

  const simulateLongTask = () => {
    // Block the main thread to trigger long task detection
    const start = Date.now();
    while (Date.now() - start < 150) {
      // Busy wait for 150ms to trigger long task
    }
  };

  const simulateSlowInteraction = () => {
    // Create a button that will have delayed response
    const testButton = document.createElement('button');
    testButton.innerText = 'Slow Response Button (Click Me)';
    testButton.style.cssText = `
      position: fixed;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      background: orange;
      border: none;
      border-radius: 4px;
      z-index: 9999;
      font-size: 14px;
    `;

    testButton.addEventListener('click', () => {
      // Simulate slow interaction processing
      const start = performance.now();
      while (performance.now() - start < 300) {
        // Busy wait for 300ms to create poor INP
      }
      testButton.style.background = 'green';
      testButton.innerText = 'Response Complete!';

      // Remove button after showing result
      setTimeout(() => {
        document.body.removeChild(testButton);
      }, 1500);
    });

    document.body.appendChild(testButton);
  };

  return (
    <>
      <EuiPanel paddingSize="l" style={{ height: '250px', marginBottom: '40px' }}>
        <EuiText>
          <h3>Developer Toolbar Demo</h3>
          <p>
            The developer toolbar appears at the bottom of the screen with performance monitoring.
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup gutterSize="s" wrap>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="warning" onClick={triggerWarning}>
              Trigger Warning
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="danger" onClick={triggerError}>
              Trigger Error
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="danger" onClick={triggerStackTraceTest}>
              Test Stack Trace
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="danger" onClick={triggerException}>
              Trigger Exception
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="accent" onClick={simulateMemoryLeak}>
              Simulate Memory Leak
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="accent" onClick={simulateFrameJank}>
              Simulate Frame Jank
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="accent" onClick={simulateLongTask}>
              Simulate Long Task
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="accent" onClick={simulateSlowInteraction}>
              Simulate Slow Interaction
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999 }}>
        <DeveloperToolbar {...props} />
      </div>
    </>
  );
};

export default {
  title: 'Platform/Developer Toolbar',
  component: DeveloperToolbarWrapper,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {},
} as Meta<DeveloperToolbarProps>;

export const Default: StoryObj<DeveloperToolbarProps> = {
  args: {
    envInfo: mockEnvInfo,
  },
};

const ExtensibleDemoApp = (props: DeveloperToolbarProps) => {
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [notifications, setNotifications] = useState(0);
  const [testItems, setTestItems] = useState<Array<{ id: string; icon: string; priority: number }>>(
    []
  );

  const addNotification = () => {
    setNotifications((prev) => prev + 1);
  };

  const clearNotifications = () => {
    setNotifications(0);
  };

  const addMultipleTestItems = () => {
    const icons = [
      'flask',
      'clock',
      'database',
      'package',
      'users',
      'wrench',
      'eye',
      'heart',
      'star',
      'bolt',
    ];
    const newItems = Array.from({ length: 30 }, (_, index) => ({
      id: `test-item-${index + 1}`,
      icon: icons[index % icons.length],
      priority: 100 + index,
    }));
    setTestItems(newItems);
  };

  const clearTestItems = () => {
    setTestItems([]);
  };

  const onDebugClick = () => {
    // eslint-disable-next-line no-console
    console.log('Debug action clicked!', { debugEnabled, notifications });
  };

  const onRefreshClick = () => {
    // eslint-disable-next-line no-console
    console.log('Refresh action clicked!');
  };

  return (
    <>
      <EuiPanel paddingSize="l" style={{ height: '300px', marginBottom: '40px' }}>
        <EuiText>
          <h3>Extensible Developer Toolbar Demo</h3>
          <p>
            This demo shows how apps can add their own items to the developer toolbar using
            declarative components.
          </p>
          <p>
            <strong>Check the toolbar:</strong> Custom items appear automatically when rendered.
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup gutterSize="s" wrap>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={() => setDebugEnabled(!debugEnabled)}>
              {debugEnabled ? 'Disable' : 'Enable'} Debug Mode
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={addNotification}>
              Add Notification ({notifications})
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={clearNotifications}>
              Clear Notifications
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" color="warning" onClick={addMultipleTestItems}>
              Add 30 Test Items
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={clearTestItems}>
              Clear Test Items ({testItems.length})
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {/* Items that appear in the toolbar - render anywhere in the component tree! */}
      <DeveloperToolbarItem priority={10} id="Debug current state">
        <EuiToolTip content="Debug current state" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="inspect"
            size="xs"
            color="text"
            onClick={onDebugClick}
            aria-label="Debug current state"
          />
        </EuiToolTip>
      </DeveloperToolbarItem>

      <DeveloperToolbarItem priority={5} id="Refresh data">
        <EuiToolTip content="Refresh data" disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="refresh"
            size="xs"
            color="text"
            onClick={onRefreshClick}
            aria-label="Refresh data"
          />
        </EuiToolTip>
      </DeveloperToolbarItem>

      {/* Conditional items - only show when debug mode is enabled */}
      {debugEnabled && (
        <DeveloperToolbarItem priority={8} id="Advanced debug options">
          <EuiToolTip content="Advanced debug options" disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="bug"
              size="xs"
              color="accent"
              onClick={onDebugClick}
              aria-label="Advanced debug options"
            />
          </EuiToolTip>
        </DeveloperToolbarItem>
      )}

      {/* Dynamic items - show notification count when there are notifications */}
      {notifications > 0 && (
        <DeveloperToolbarItem priority={3} id={`${notifications} notifications`}>
          <EuiToolTip content="Clear notifications" disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="bell"
              size="xs"
              color="warning"
              onClick={clearNotifications}
              aria-label="Clear notifications"
            />
          </EuiToolTip>
        </DeveloperToolbarItem>
      )}

      {/* Render test items */}
      {testItems.map((item) => (
        <DeveloperToolbarItem key={item.id} priority={item.priority} id={item.id}>
          <EuiToolTip content={`Test item: ${item.id}`} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType={item.icon}
              size="xs"
              color="primary"
              onClick={() => {
                // eslint-disable-next-line no-console
                console.log(`Clicked ${item.id}`);
              }}
              aria-label={`Test item: ${item.id}`}
            />
          </EuiToolTip>
        </DeveloperToolbarItem>
      ))}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999 }}>
        <DeveloperToolbar {...props} />
      </div>
    </>
  );
};

export const Extensible: StoryObj<DeveloperToolbarProps> = {
  render: (args) => <ExtensibleDemoApp {...args} />,
  args: {
    envInfo: mockEnvInfo,
  },
};
