/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButton, EuiFlexGroup, EuiFlexItem, useEuiTheme } from '@elastic/eui';
import React from 'react';
import { createRestorableStateProvider } from '@kbn/restorable-state';
import { KbnInfoCallout } from '@kbn/ui-callout';
import { z } from '@kbn/zod';

const RestorableStateDocViewBase: React.FC<{
  clickCount: number;
  onIncrement: () => void;
}> = ({ clickCount, onIncrement }) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="m"
      responsive={false}
      css={{ padding: euiTheme.size.m }}
    >
      <EuiFlexItem grow={false}>
        <KbnInfoCallout
          title="DocView restorable & shareable state"
          text={
            <>
              <p>
                By wrapping your custom <code>DocView</code> with <code>withRestorableState</code>{' '}
                and using <code>useRestorableState</code>, you can easily add restorable state to
                your component. State is coupled to the specific tab and will be restored when
                navigating away and back to the tab as long as you don&apos;t close the flyout or
                change the displayed document.
              </p>
              <p>
                Declaring a <code>shareableStateSchema</code> on the <code>DocView</code>{' '}
                additionally deep-links the schema-allowed subset of that state: it round-trips
                through the URL, so a shared document link reopens on the same tab with this state
                restored. Try incrementing the counter, then copy the URL into a new tab.
              </p>
            </>
          }
        />
      </EuiFlexItem>
      <EuiFlexGroup gutterSize="s" direction="column">
        <EuiFlexItem grow={false}>
          <div data-test-subj="example-restorable-state-doc-view-count">Count: {clickCount}</div>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            color="text"
            size="s"
            onClick={onIncrement}
            data-test-subj="example-restorable-state-doc-view-increment-button"
          >
            Increment
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexGroup>
  );
};

interface RestorableStateDocViewState {
  clickCount: number;
}

/**
 * Marks the doc view's `clickCount` as URL-shareable, so a shared document link restores the counter.
 */
export const restorableStateDocViewShareableStateSchema = z.object({
  clickCount: z.number().int().nonnegative().max(1_000_000),
});

const { withRestorableState, useRestorableState } =
  createRestorableStateProvider<RestorableStateDocViewState>();

export const RestorableStateDocView = withRestorableState(() => {
  const [clickCount, setClickCount] = useRestorableState('clickCount', 0);

  return (
    <RestorableStateDocViewBase
      clickCount={clickCount}
      onIncrement={() => setClickCount(clickCount + 1)}
    />
  );
});
