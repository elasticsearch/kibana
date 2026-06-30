/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import {
  EuiSpacer,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiText,
  EuiFormRow,
  EuiButtonIcon,
  EuiToolTip,
} from '@elastic/eui';
import type { SidebarComponentProps } from '@kbn/core-chrome-sidebar';
import { SidebarHeader, SidebarBody, useSidebarApp } from '@kbn/core-chrome-sidebar-components';

export const counterAppId = 'sidebarExampleCounter';

/** Typed hook for the counter sidebar app (stateless) */
export const useCounterSidebarApp = () => useSidebarApp(counterAppId);

/**
 * Counter app that uses internal React state.
 * Demonstrates a sidebar app without params - state is not persisted.
 * Demonstrates header actions with a reset button in the header.
 */
export function CounterApp({ onClose }: SidebarComponentProps) {
  const [counter, setCounter] = useState(0);

  const increment = () => setCounter((c) => c + 1);
  const decrement = () => setCounter((c) => c - 1);
  const incrementBy = (amount: number) => setCounter((c) => c + amount);
  const reset = () => setCounter(0);

  return (
    <>
      <SidebarHeader
        title="Counter Example"
        onClose={onClose}
        actions={
          <EuiToolTip content="Reset counter" disableScreenReaderOutput>
            <EuiButtonIcon iconType="refresh" aria-label="Reset counter" onClick={reset} />
          </EuiToolTip>
        }
      />
      <SidebarBody>
        <EuiText size="s" color="subdued">
          <p>Counter uses internal React state (not persisted).</p>
        </EuiText>

        <EuiSpacer size="l" />

        <EuiFormRow label="Counter">
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiButton size="s" onClick={decrement}>
                -
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="primary">{counter}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size="s" onClick={increment}>
                +
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size="s" onClick={() => incrementBy(5)}>
                +5
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
      </SidebarBody>
    </>
  );
}
