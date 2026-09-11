/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import escape from 'lodash/escape';
import { formatValue as createTooltipContent } from 'vega-tooltip';
import type { View } from 'vega';
import type { VegaSandboxTooltipConfig } from './types';

const tooltipId = 'vega-kibana-sandbox-tooltip';

const escapeHtml = (value: unknown): string => escape(String(value));

const normalizePadding = (padding: VegaSandboxTooltipConfig['padding']): number => {
  if (typeof padding === 'number') {
    return padding;
  }

  if (padding && typeof padding === 'object') {
    return Math.max(padding.left, padding.right, padding.top, padding.bottom);
  }

  return 16;
};

/** Match visTypeVega's parser: true always centers, false always uses the cursor. */
export const normalizeCenterOnMark = (
  centerOnMark: VegaSandboxTooltipConfig['centerOnMark']
): number => {
  if (typeof centerOnMark === 'number') {
    return centerOnMark;
  }
  if (centerOnMark === true) {
    return Number.MAX_VALUE;
  }
  if (centerOnMark === false) {
    return -1;
  }
  return 50;
};

interface VegaTooltipGroupItem {
  mark?: { group?: VegaTooltipGroupItem };
  x?: number;
  y?: number;
}

interface VegaTooltipItem {
  bounds: {
    height: () => number;
    width: () => number;
    x1: number;
    y1: number;
  };
  mark?: { group?: VegaTooltipGroupItem };
}

export const getNestedGroupOffset = (item: VegaTooltipItem): { x: number; y: number } => {
  let x = 0;
  let y = 0;
  let ancestor = item.mark?.group;

  while (ancestor) {
    x += ancestor.x ?? 0;
    y += ancestor.y ?? 0;
    ancestor = ancestor.mark?.group;
  }

  return { x, y };
};

export const positionSandboxTooltip = ({
  anchorHeight,
  anchorLeft,
  anchorTop,
  anchorWidth,
  containerHeight,
  containerWidth,
  padding,
  position,
  tooltipHeight,
  tooltipWidth,
}: {
  anchorHeight: number;
  anchorLeft: number;
  anchorTop: number;
  anchorWidth: number;
  containerHeight: number;
  containerWidth: number;
  padding: number;
  position: NonNullable<VegaSandboxTooltipConfig['position']>;
  tooltipHeight: number;
  tooltipWidth: number;
}): { left: number; top: number } => {
  let left: number;
  let top: number;

  switch (position) {
    case 'bottom':
      left = anchorLeft + anchorWidth / 2 - tooltipWidth / 2;
      top = anchorTop + anchorHeight + padding;
      break;
    case 'left':
      left = anchorLeft - tooltipWidth - padding;
      top = anchorTop + anchorHeight / 2 - tooltipHeight / 2;
      break;
    case 'right':
      left = anchorLeft + anchorWidth + padding;
      top = anchorTop + anchorHeight / 2 - tooltipHeight / 2;
      break;
    case 'top':
    default:
      left = anchorLeft + anchorWidth / 2 - tooltipWidth / 2;
      top = anchorTop - tooltipHeight - padding;
      break;
  }

  const maxLeft = Math.max(padding, containerWidth - tooltipWidth - padding);
  const maxTop = Math.max(padding, containerHeight - tooltipHeight - padding);

  return {
    left: Math.min(Math.max(padding, left), maxLeft),
    top: Math.min(Math.max(padding, top), maxTop),
  };
};

export class TooltipHandler {
  private readonly centerOnMark: number;
  private readonly padding: number;
  private readonly position: NonNullable<VegaSandboxTooltipConfig['position']>;
  private readonly textTruncate: boolean;

  constructor(private readonly container: HTMLElement, view: View, opts: VegaSandboxTooltipConfig) {
    this.centerOnMark = normalizeCenterOnMark(opts.centerOnMark);
    this.padding = normalizePadding(opts.padding);
    this.position = opts.position ?? 'top';
    this.textTruncate = Boolean(opts.textTruncate);

    view.tooltip((vegaView, event, item, value) =>
      this.handler(vegaView, event, item as unknown as VegaTooltipItem, value)
    );
  }

  handler(view: View, event: MouseEvent, item: VegaTooltipItem, value: unknown): void {
    this.hideTooltip();

    if (value == null || value === '') {
      return;
    }

    const tooltip = document.createElement('div');
    tooltip.id = tooltipId;
    tooltip.classList.add('vgaVis__tooltip', `vgaVis__tooltip--${this.position}`);
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';

    if (this.textTruncate) {
      tooltip.classList.add('vgaVis__tooltip--textTruncate');
    }

    // Sanitized HTML is created by the tooltip library,
    // with a large number of tests, hence suppressing eslint here.
    // eslint-disable-next-line no-unsanitized/property
    tooltip.innerHTML = createTooltipContent(value, escapeHtml, 2);
    this.container.appendChild(tooltip);

    const containerBox = this.container.getBoundingClientRect();
    const tooltipBox = tooltip.getBoundingClientRect();
    const shouldUseCursor =
      item.bounds.width() > this.centerOnMark || item.bounds.height() > this.centerOnMark;

    const [originLeft, originTop] = view.origin();
    const groupOffset = getNestedGroupOffset(item);
    const anchorLeft = shouldUseCursor
      ? event.clientX - containerBox.left
      : originLeft + groupOffset.x + item.bounds.x1;
    const anchorTop = shouldUseCursor
      ? event.clientY - containerBox.top
      : originTop + groupOffset.y + item.bounds.y1;
    const { left, top } = positionSandboxTooltip({
      anchorHeight: shouldUseCursor ? 0 : item.bounds.height(),
      anchorLeft,
      anchorTop,
      anchorWidth: shouldUseCursor ? 0 : item.bounds.width(),
      containerHeight: containerBox.height,
      containerWidth: containerBox.width,
      padding: this.padding,
      position: this.position,
      tooltipHeight: tooltipBox.height,
      tooltipWidth: tooltipBox.width,
    });

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  hideTooltip(): void {
    document.getElementById(tooltipId)?.remove();
  }
}
