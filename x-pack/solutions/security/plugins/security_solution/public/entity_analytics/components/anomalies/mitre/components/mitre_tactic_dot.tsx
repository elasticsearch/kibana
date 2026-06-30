/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';

const CHIP_ROW_HEIGHT = 28;
const TICK_HEIGHT = 6;
const CHIP_TICK_GAP = 2;

const anomaliesCountText = (count: number): string =>
  i18n.translate(
    'xpack.securitySolution.entityAnalytics.entityAnomalies.mitre.dot.anomalyCountTooltip',
    {
      defaultMessage: '{count, plural, one {# anomaly} other {# anomalies}}',
      values: { count },
    }
  );

export const computeHaloOpacity = (
  isSelected: boolean,
  detected: boolean,
  isHovered: boolean
): number => {
  if (isSelected || (detected && isHovered)) return 1;
  return detected ? 0.25 : 0;
};

export const computeIsChipVisible = (
  showHoverChip: boolean,
  isHovered: boolean,
  isSelected: boolean,
  isPersistentDefault: boolean,
  isAnotherDotHovered: boolean
): boolean =>
  showHoverChip && (isHovered || isSelected || (isPersistentDefault && !isAnotherDotHovered));

interface ChipRowProps {
  anomalyCount: number;
  chipAriaLabel: string;
  chipRef: React.RefObject<HTMLDivElement>;
  flipToRight: boolean;
  handleActivate: (() => void) | undefined;
  handleToggle: React.MouseEventHandler<HTMLButtonElement>;
  handleToggleKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  isChipVisible: boolean;
  isHovered: boolean;
  isSelected: boolean;
  tactic: string;
}

const ChipRow: React.FC<ChipRowProps> = ({
  anomalyCount,
  chipAriaLabel,
  chipRef,
  flipToRight,
  handleActivate,
  handleToggle,
  handleToggleKeyDown,
  isChipVisible,
  isHovered,
  isSelected,
  tactic,
}) => {
  const { euiTheme } = useEuiTheme();
  return (
    <div
      css={css`
        position: relative;
        height: ${CHIP_ROW_HEIGHT}px;
        width: 100%;
      `}
    >
      {/* Tick stroke connecting the chip to the dot. */}
      <div
        aria-hidden
        css={css`
          position: absolute;
          left: 4px;
          bottom: 0;
          width: 1px;
          height: ${TICK_HEIGHT}px;
          background: ${euiTheme.colors.lightShade};
          opacity: ${isChipVisible ? 1 : 0};
          transition: opacity 120ms ease;
          z-index: ${Number(euiTheme.levels.content) + 3};
          pointer-events: none;
        `}
      />
      <div
        ref={chipRef}
        className="mitreTacticDotV3__hoverChip"
        css={css`
          position: absolute;
          ${flipToRight
            ? css`
                right: calc(100% - 4px);
                left: auto;
              `
            : css`
                left: 4px;
                right: auto;
              `}
          bottom: ${TICK_HEIGHT + CHIP_TICK_GAP}px;
          opacity: ${isChipVisible ? 1 : 0};
          pointer-events: ${isChipVisible ? 'auto' : 'none'};
          transition: opacity 120ms ease;
          white-space: nowrap;
          /* Hovered chip floats above the persistently-visible "selected"
             chip so it never gets buried by the active filter. */
          z-index: ${isHovered ? 5 : 4};
        `}
      >
        <EuiFlexGroup gutterSize="none" responsive={false} alignItems="center" wrap={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge
              color="hollow"
              css={css`
                border-top-right-radius: 0;
                border-bottom-right-radius: 0;
              `}
            >
              {anomalyCount}
            </EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {handleActivate && isSelected ? (
              <EuiBadge
                color="hollow"
                onClick={handleToggle}
                onClickAriaLabel={chipAriaLabel}
                aria-pressed={true}
                onKeyDown={handleToggleKeyDown}
                iconType="cross"
                data-test-subj="mitreTacticDotV3HoverChipClear"
                css={css`
                  border-top-left-radius: 0;
                  border-bottom-left-radius: 0;
                  border-left: none;
                `}
              >
                {tactic}
              </EuiBadge>
            ) : handleActivate ? (
              <EuiBadge
                color="hollow"
                onClick={handleToggle}
                onClickAriaLabel={chipAriaLabel}
                aria-pressed={false}
                onKeyDown={handleToggleKeyDown}
                css={css`
                  border-top-left-radius: 0;
                  border-bottom-left-radius: 0;
                  border-left: none;
                `}
              >
                {tactic}
              </EuiBadge>
            ) : (
              <EuiBadge
                color="hollow"
                css={css`
                  border-top-left-radius: 0;
                  border-bottom-left-radius: 0;
                  border-left: none;
                `}
              >
                {tactic}
              </EuiBadge>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    </div>
  );
};

interface MitreTacticDotProps {
  anomalyCount?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
  detected: boolean;
  isAnotherDotHovered?: boolean;
  isClickable?: boolean;
  isLast?: boolean;
  isPersistentDefault?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  onHoverChange?: (tactic: string, isHovered: boolean) => void;
  showLabel: boolean;
  tactic: string;
}

export const MitreTacticDot: React.FC<MitreTacticDotProps> = ({
  anomalyCount = 0,
  containerRef,
  detected,
  isAnotherDotHovered = false,
  isClickable = false,
  isLast = false,
  isPersistentDefault = false,
  isSelected = false,
  onClick,
  onHoverChange,
  showLabel,
  tactic,
}) => {
  const { euiTheme } = useEuiTheme();
  const color = detected ? euiTheme.colors.danger : euiTheme.colors.subduedText;

  const [isHovered, setIsHovered] = useState(false);

  // Selected halo: grows from 16x16 to 20x20 and 25% → 100% opacity.
  // Hover on an active (detected) dot also takes the halo to full opacity
  // so the dot reads as the same solid red as the inner circle — an
  // affordance that the dot is interactive without changing its size.
  const haloOpacity = computeHaloOpacity(isSelected, detected, isHovered);
  const haloSize = isSelected ? 20 : 16;
  const haloOffset = isSelected ? -6 : -4;

  const handleActivate = isClickable && onClick ? onClick : undefined;

  const showHoverChip = typeof anomalyCount === 'number';

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    onHoverChange?.(tactic, false);
  }, [onHoverChange, tactic]);

  // Chip is visible when (a) the user is hovering / has focused this dot,
  // (b) this is the user-selected tactic, or (c) this dot is the chain's
  // persistent-default and no other dot is currently being hovered. (c)
  // implements the spec: first active tactic shows its chip by default,
  // disappears while the user hovers a different tactic, reappears as
  // soon as the cursor leaves all dots.
  const isChipVisible = computeIsChipVisible(
    showHoverChip,
    isHovered,
    isSelected,
    isPersistentDefault,
    isAnotherDotHovered
  );

  // Left-aligned chip (extending rightward from the dot).
  // For the last few dots in the chain, the default would overflow
  // the container's right edge so we flip to right-aligned (extending leftward).
  const chipRef = useRef<HTMLDivElement | null>(null);
  const dotInnerRef = useRef<HTMLDivElement | null>(null);
  const [flipToRight, setFlipToRight] = useState(false);

  const measureAlignment = useCallback(() => {
    if (!showHoverChip) return;
    const chipEl = chipRef.current;
    const dotEl = dotInnerRef.current;
    const containerEl = containerRef?.current;
    if (!chipEl || !dotEl || !containerEl) return;
    const chipWidth = chipEl.getBoundingClientRect().width;
    if (chipWidth === 0) return;
    const dotRect = dotEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    if (containerRect.width === 0) return;
    const dotCenterX = dotRect.left + dotRect.width / 2;
    // Left-aligned chip's left edge sits at the dot center, so its right
    // edge would be at (dotCenterX + chipWidth). If that's past the
    // container's right edge, flip to right alignment.
    const hypotheticalLeftAlignedRight = dotCenterX + chipWidth;
    setFlipToRight(hypotheticalLeftAlignedRight > containerRect.right);
  }, [showHoverChip, containerRef]);

  useLayoutEffect(() => {
    measureAlignment();
    const containerEl = containerRef?.current;
    if (!containerEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureAlignment);
    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [measureAlignment, containerRef]);

  const handleMouseEnter = useCallback(() => {
    measureAlignment();
    setIsHovered(true);
    onHoverChange?.(tactic, true);
  }, [measureAlignment, onHoverChange, tactic]);

  const handleToggle = useCallback<React.MouseEventHandler<HTMLButtonElement>>(
    (e) => {
      e.stopPropagation();
      handleActivate?.();
    },
    [handleActivate]
  );

  const handleToggleKeyDown = useCallback<React.KeyboardEventHandler<HTMLButtonElement>>(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleActivate?.();
      }
    },
    [handleActivate]
  );

  const handleDotKeyDown = useCallback<React.KeyboardEventHandler<HTMLDivElement>>(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleActivate?.();
      }
    },
    [handleActivate]
  );

  const chipAriaLabel = `${tactic}, ${anomaliesCountText(anomalyCount)}`;

  const hoverHandlers = showHoverChip
    ? {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleMouseEnter,
        onBlur: handleMouseLeave,
      }
    : {};

  return (
    <div
      {...hoverHandlers}
      onClick={handleActivate}
      onKeyDown={handleActivate ? handleDotKeyDown : undefined}
      role={handleActivate ? 'button' : undefined}
      tabIndex={handleActivate ? 0 : undefined}
      css={css`
        position: relative;
        width: 100%;
        cursor: ${handleActivate ? 'pointer' : 'default'};
      `}
    >
      {showHoverChip && (
        <ChipRow
          anomalyCount={anomalyCount}
          chipAriaLabel={chipAriaLabel}
          chipRef={chipRef}
          flipToRight={flipToRight}
          handleActivate={handleActivate}
          handleToggle={handleToggle}
          handleToggleKeyDown={handleToggleKeyDown}
          isChipVisible={isChipVisible}
          isHovered={isHovered}
          isSelected={isSelected}
          tactic={tactic}
        />
      )}
      <div
        css={css`
          position: relative;
          height: 8px;
        `}
      >
        {/* Inner circle */}
        <div
          ref={dotInnerRef}
          data-test-subj="mitreInnerCircle"
          css={css`
            position: absolute;
            left: 0;
            top: 0;
            width: 8px;
            height: 8px;
            background: ${euiTheme.colors.backgroundBasePlain};
            border: 2px solid ${color};
            border-radius: 50%;
            z-index: ${Number(euiTheme.levels.content) + 2};
          `}
        />
        {/* Outer halo — full opacity + expanded when selected. */}
        <div
          data-test-subj="mitreOuterCircle"
          css={css`
            position: absolute;
            left: ${haloOffset}px;
            top: ${haloOffset}px;
            width: ${haloSize}px;
            height: ${haloSize}px;
            background: transparent;
            border: 2px solid ${color};
            border-radius: 50%;
            opacity: ${haloOpacity};
            z-index: ${Number(euiTheme.levels.content) + 1};
            transition: width 120ms ease, height 120ms ease, opacity 120ms ease, left 120ms ease,
              top 120ms ease;
          `}
        />
        {/* Connector line — 4 px stub when last, full cell otherwise. */}
        <div
          css={
            isLast
              ? css`
                  position: absolute;
                  left: 0;
                  width: 4px;
                  top: 3px;
                  border-bottom: 1px solid ${euiTheme.colors.lightShade};
                  height: 0;
                `
              : css`
                  position: absolute;
                  left: 0;
                  right: 0;
                  top: 3px;
                  border-bottom: 1px solid ${euiTheme.colors.lightShade};
                  height: 0;
                `
          }
        />
      </div>
      {showLabel && (
        <div
          css={css`
            margin-top: ${euiTheme.size.s};
            min-width: 0;
            padding-right: 8px;
          `}
        >
          <EuiText
            size="xs"
            color={detected ? 'danger' : 'subdued'}
            css={css`
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              display: block;
              ${isSelected ? 'font-weight: 600;' : ''}
            `}
          >
            <span>{tactic}</span>
          </EuiText>
        </div>
      )}
    </div>
  );
};
