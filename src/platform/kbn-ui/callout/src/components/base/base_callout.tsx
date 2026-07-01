/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType } from '@elastic/eui';
import { EuiPanel, useEuiMemoizedStyles } from '@elastic/eui';
import type { CSSProperties, FC, ReactNode } from 'react';
import React, { useMemo } from 'react';
import { calloutStyles } from './styles/callout.styles';
import type { KbnCalloutAction } from './callout_action';
import { CalloutActionRow } from './callout_action_row';
import { CalloutBody } from './callout_body';
import { CalloutDismiss } from './callout_dismiss';
import { CalloutHeader } from './callout_header';
import { CalloutIcon } from './callout_icon';
import { useCalloutColors } from './use_callout_colors';

export type KbnCalloutColor = 'primary' | 'success' | 'warning' | 'danger';

export type KbnCalloutSize = 's' | 'm';

/**
 * Props for {@link KbnCallout}. The `Kbn*Callout` variants reuse this contract
 * minus `color` and `iconType`, which they own to keep callouts consistent.
 */
export interface KbnCalloutProps {
  /** Title. Keep it short — text only. */
  title?: ReactNode;
  /**
   * Body content. For `size="s"` it renders inline with the title, separated by
   * a dot.
   */
  content?: ReactNode;
  /**
   * `m` stacks the title above the content; `s` renders them inline like a
   * banner.
   *
   * @default 'm'
   */
  size?: KbnCalloutSize;
  /** Renders a dismiss (X) button and fires this callback when clicked. */
  onDismiss?: () => void;
  /**
   * Primary and (optionally) secondary actions. A secondary action cannot be
   * shown on its own — the type requires a primary one.
   */
  actions?: {
    primary: KbnCalloutAction;
    secondary?: KbnCalloutAction;
  };
  /** Variant color. */
  color: KbnCalloutColor;
  /** Overrides the variant's default notification icon. */
  iconType?: IconType;
  /** `data-test-subj` attribute. */
  'data-test-subj'?: string;
}

/**
 * Bespoke replica of the redesigned `EuiCallOut`
 * ({@link https://github.com/elastic/eui/pull/9642}), built on public EUI
 * primitives until the native component ships. Variants preset `color`; this
 * component composes the icon, header, body, dismiss button, and action row.
 */
export const KbnCallout: FC<KbnCalloutProps> = ({
  title,
  content,
  color,
  iconType,
  size = 'm',
  onDismiss,
  actions,
  'data-test-subj': dataTestSubj,
}) => {
  const styles = useEuiMemoizedStyles(calloutStyles);
  const { stripeColor, borderColor } = useCalloutColors(color);

  const cssVariables = useMemo(
    () =>
      ({
        '--kbnCalloutTypeColor': stripeColor,
        '--kbnCalloutBorderColor': borderColor,
      } as CSSProperties),
    [stripeColor, borderColor]
  );

  return (
    <EuiPanel
      borderRadius="none"
      color={color}
      hasShadow={false}
      hasBorder={false}
      paddingSize="none"
      grow={false}
      data-size={size}
      data-test-subj={dataTestSubj}
      css={[styles.euiCallOut, onDismiss && styles.hasDismissButton]}
      style={cssVariables}
    >
      <div css={styles.wrapper}>
        <div css={styles.body}>
          <CalloutIcon {...{ color, size, iconType }} />
          <div css={styles.content}>
            <CalloutHeader {...{ title, size }} />
            <CalloutBody {...{ content, size }} />
          </div>
        </div>
        <CalloutActionRow {...{ color, actions }} />
      </div>
      {/* Absolutely positioned and placed last so screen readers reach it after the content. */}
      <CalloutDismiss {...{ color, onDismiss }} />
    </EuiPanel>
  );
};
