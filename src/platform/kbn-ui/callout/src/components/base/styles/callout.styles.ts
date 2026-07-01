/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { logicalCSS, logicalShorthandCSS, mathWithUnits, preventForcedColors } from '@elastic/eui';
import { css } from '@emotion/react';
import type { KbnCalloutSize } from '../base_callout';

/** Maximum reading width for the content slot. */
const TEXT_MAX_WIDTH = 1200;
const CONTAINER_NAME = 'kbnCallout';
const LAYOUTS = ['superNarrow', 'wide'] as const;
type Layout = (typeof LAYOUTS)[number];

const BREAKPOINTS: Record<KbnCalloutSize, Record<Layout, string>> = {
  s: { superNarrow: '(max-width: 400px)', wide: '(min-width: 800px)' },
  m: { superNarrow: '(max-width: 600px)', wide: '(min-width: 1000px)' },
};

const withContainerQuery = ({ layout, styles }: { layout: Layout; styles: string }) =>
  (Object.keys(BREAKPOINTS) as KbnCalloutSize[])
    .map(
      (size) => `
        @container ${CONTAINER_NAME}--${size} ${BREAKPOINTS[size][layout]} {
          ${styles}
        }
      `
    )
    .join('\n');

/**
 * Bespoke replica of the redesigned `EuiCallOut` layout
 * ({@link https://github.com/elastic/eui/pull/9642}) using public EUI tokens,
 * pending the native component's release. The variant color (border, stripe,
 * background) is supplied by the component via the `--kbnCalloutTypeColor`
 * custom property and the `EuiPanel` `color`.
 *
 * The narrow → wide switch is driven by container queries that differ per
 * `size`. In wide layouts the action row reverses so the primary action sits on
 * the right.
 */
export const calloutStyles = (euiThemeContext: UseEuiTheme) => {
  const { euiTheme } = euiThemeContext;

  const paddingSizes = { s: euiTheme.size.m, m: euiTheme.size.base };
  const borderRadius = euiTheme.border.radius.small;
  const highlightSize = mathWithUnits(
    [euiTheme.border.width.thin, euiTheme.border.width.thick],
    (x, y) => x + y
  );
  const highlightSizeOffset = mathWithUnits([euiTheme.border.width.thin], (x) => x * 2);
  const separatorSize = mathWithUnits([euiTheme.size.s, euiTheme.size.xxs], (x, y) => x + y);

  return {
    euiCallOut: css`
      container-type: inline-size;
      container-name: ${CONTAINER_NAME};
      position: relative;
      display: flex;
      align-items: center;
      border: ${euiTheme.border.width.thin} solid var(--kbnCalloutBorderColor);
      border-radius: ${borderRadius};

      &::before {
        content: '';
        position: absolute;
        inset-block-start: -${euiTheme.border.width.thin};
        inset-inline-start: -${euiTheme.border.width.thin};
        block-size: calc(100% + ${highlightSizeOffset});
        border-inline-start: ${highlightSize} solid var(--kbnCalloutTypeColor);
        border-start-start-radius: ${borderRadius};
        border-end-start-radius: ${borderRadius};
        pointer-events: none;

        ${preventForcedColors(euiThemeContext)}
      }

      &:where([data-size='s']) {
        container-name: ${CONTAINER_NAME} ${CONTAINER_NAME}--s;
        ${logicalShorthandCSS('padding', `${paddingSizes.s} ${paddingSizes.m}`)}
      }

      &:where([data-size='m']) {
        container-name: ${CONTAINER_NAME} ${CONTAINER_NAME}--m;
        padding: ${paddingSizes.m};
      }
    `,
    hasDismissButton: css`
      &:where([data-size]) {
        ${logicalCSS('padding-right', euiTheme.size.xxl)}
      }
    `,
    wrapper: css`
      display: flex;
      flex-direction: column;
      inline-size: 100%;

      &:where([data-size='s'] &) {
        gap: ${euiTheme.size.s};
      }

      &:where([data-size='m'] &) {
        gap: ${euiTheme.size.m};
      }

      ${withContainerQuery({
        layout: 'wide',
        styles: `
          flex-direction: row;
          gap: ${euiTheme.size.xxl};
        `,
      })}
    `,
    body: css`
      display: flex;
      flex-direction: row;
      align-self: center;
      inline-size: 100%;

      &:where([data-size='s'] &) {
        gap: ${euiTheme.size.s};
      }

      &:where([data-size='m'] &) {
        gap: ${euiTheme.size.m};
      }
    `,
    content: css`
      align-self: center;
      inline-size: 100%;
      max-inline-size: ${TEXT_MAX_WIDTH}px;

      &:where([data-size='s'] &) {
        block-size: min-content;

        > .kbnCallout__header {
          display: inline;
          ${logicalCSS('margin-right', euiTheme.size.xxs)}
        }

        > .kbnCallout__content {
          display: inline;

          * {
            display: inline;
          }

          &:where(:not(:first-child))::before {
            content: '·';
            display: inline-block;
            inline-size: ${separatorSize};
            text-align: center;
            color: ${euiTheme.colors.textHeading};
          }
        }
      }

      &:where([data-size='m'] &) {
        display: flex;
        flex-direction: column;
        gap: ${euiTheme.size.xs};
      }
    `,
    header: css`
      font-weight: ${euiTheme.font.weight.bold};
      ${logicalCSS('margin-bottom', '0 !important')}
      color: ${euiTheme.colors.textParagraph};
    `,
    icon: css`
      ${logicalCSS('margin-vertical', euiTheme.size.xxs)}
    `,
    dismissButton: css`
      position: absolute;
      ${logicalCSS('top', euiTheme.size.s)}
      ${logicalCSS('right', euiTheme.size.s)}
    `,
    actions: css`
      display: flex;
      gap: ${euiTheme.size.s};

      &:where([data-size='s'] &) {
        ${logicalCSS('margin-left', euiTheme.size.l)}
      }

      &:where([data-size='m'] &) {
        ${logicalCSS('margin-left', euiTheme.size.xl)}
      }

      @container ${CONTAINER_NAME} ${BREAKPOINTS.s.superNarrow} {
        flex-wrap: wrap;

        > * {
          inline-size: 100%;
        }
      }

      ${withContainerQuery({
        layout: 'wide',
        styles: `
          ${logicalCSS('margin-left', '0')}
          align-self: center;
          flex-shrink: 0;
          flex-direction: row-reverse;
        `,
      })}
    `,
  };
};
