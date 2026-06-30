/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { CSSObject } from '@emotion/react';
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { i18n } from '@kbn/i18n';

export type WorkflowDetailBottomBarView = 'yaml' | 'graph';

/**
 * Published by `WorkflowDetailBottomBar` so any popovers anchored to its
 * buttons (e.g. keyboard shortcuts, editor settings) can close themselves
 * when the bar auto-collapses to the small pill — otherwise the popover
 * stays floating on the canvas with no visible anchor.
 */
interface WorkflowBottomBarContextValue {
  isExpanded: boolean;
}
const WorkflowBottomBarContext = createContext<WorkflowBottomBarContextValue>({ isExpanded: true });

export function useWorkflowBottomBarState(): WorkflowBottomBarContextValue {
  return useContext(WorkflowBottomBarContext);
}

export interface ToolMenuItemDef {
  iconType: string;
  label: string;
  onClick?: () => void;
  href?: string;
  target?: string;
}

export interface WorkflowDetailBottomBarProps {
  editorView: WorkflowDetailBottomBarView;
  onEditorViewChange: (next: WorkflowDetailBottomBarView) => void;
  /**
   * Leftmost slot shown only in YAML view (e.g. "add step" + documentation).
   * Mirrors ZoomControls in graph view.
   */
  yamlActionsSlot?: ReactNode;
  toolsSlot?: ReactNode;
  /** Structured list of tool actions rendered as a named list inside the compact ⋮ popover. */
  toolsMenuItems?: ToolMenuItemDef[];
  testWorkflowButton?: ReactNode;
  /** Icon-only variant of testWorkflowButton shown in compact mode. Falls back to testWorkflowButton if not provided. */
  testWorkflowButtonCompact?: ReactNode;
  /**
   * Extra space (in px) to add to the bar's `bottom` offset. Useful when an
   * expandable panel below (e.g. validation errors) would otherwise overlap
   * the bar.
   */
  bottomOffset?: number;
  /**
   * When true, the bar stays expanded indefinitely — the 5s post-mount
   * auto-collapse and the 600ms mouseLeave collapse are both skipped. The
   * collapsed pill is hidden as well. Wired up to the "Hide controls menu"
   * setting in the settings popover.
   */
  disableAutoCollapse?: boolean;
  /**
   * When false, the view-toggle (Graph / YAML switch) is hidden. Use this
   * to suppress the toggle when the graph view is not available.
   */
  showViewToggle?: boolean;
}

// Figma Shadow/Medium composite.
const BAR_SHADOW =
  '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 4px 8px 0 rgba(43, 57, 79, 0.12), 0 8px 16px 0 rgba(43, 57, 79, 0.06)';

// Subtle shadow for the active view-toggle button (Figma Shadow/X-small).
const TOGGLE_ACTIVE_SHADOW =
  '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 1px 4px 0 rgba(43, 57, 79, 0.06), 0 2px 8px 0 rgba(43, 57, 79, 0.05)';

// Width (px) of the bar's position: relative container below which we switch
// to the compact "…" pill. Chosen to give the full bar enough room before it
// starts overlapping the minimap (bottom-left of the canvas).
const COMPACT_THRESHOLD_PX = 800;

function ViewToggle({
  editorView,
  onEditorViewChange,
}: {
  editorView: WorkflowDetailBottomBarView;
  onEditorViewChange: (next: WorkflowDetailBottomBarView) => void;
}) {
  const { euiTheme } = useEuiTheme();
  const items: Array<{ id: WorkflowDetailBottomBarView; iconType: string; label: string }> = [
    {
      id: 'graph',
      iconType: 'workflow',
      label: i18n.translate('workflowsUi.bottomBar.editorViewGraph', { defaultMessage: 'Graph' }),
    },
    {
      id: 'yaml',
      iconType: 'editorCodeBlock',
      label: i18n.translate('workflowsUi.bottomBar.editorViewYaml', { defaultMessage: 'YAML' }),
    },
  ];

  return (
    <div
      role="group"
      aria-label={i18n.translate('workflowsUi.bottomBar.editorViewLegend', {
        defaultMessage: 'Editor view',
      })}
      css={{
        background: euiTheme.colors.backgroundBaseSubdued,
        border: `1px solid ${euiTheme.colors.borderBaseSubdued}`,
        borderRadius: 6,
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {items.map(({ id, iconType, label }) => {
        const active = id === editorView;
        return (
          <EuiToolTip key={id} content={label} disableScreenReaderOutput>
            <button
              type="button"
              aria-label={label}
              aria-pressed={active}
              onClick={() => onEditorViewChange(id)}
              data-test-subj={`workflowEditorViewToggle-${id}`}
              css={{
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 4,
                padding: 0,
                background: active ? euiTheme.colors.backgroundBasePlain : 'transparent',
                boxShadow: active ? TOGGLE_ACTIVE_SHADOW : 'none',
                color: euiTheme.colors.text,
                transition: 'background 120ms ease, box-shadow 120ms ease',
                '&:hover': {
                  background: active
                    ? euiTheme.colors.backgroundBasePlain
                    : euiTheme.colors.backgroundBaseInteractiveHover,
                },
                '&:focus-visible': {
                  outline: `2px solid ${euiTheme.colors.primary}`,
                  outlineOffset: 2,
                },
              }}
            >
              <EuiIcon
                type={iconType}
                aria-hidden
                color={active ? euiTheme.colors.primaryText : euiTheme.colors.text}
              />
            </button>
          </EuiToolTip>
        );
      })}
    </div>
  );
}

function CompactToolsMenu({
  toolsMenuItems,
  toolsSlot,
}: {
  toolsMenuItems?: ToolMenuItemDef[];
  toolsSlot?: ReactNode;
}) {
  const { euiTheme } = useEuiTheme();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  if ((!toolsMenuItems || toolsMenuItems.length === 0) && !toolsSlot) {
    return null;
  }

  const label = i18n.translate('workflowsUi.bottomBar.toolsMenu', {
    defaultMessage: 'Tools',
  });

  return (
    <EuiPopover
      isOpen={isOpen}
      closePopover={close}
      anchorPosition="upCenter"
      panelPaddingSize="s"
      aria-label={label}
      button={
        <EuiToolTip content={label} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="boxesVertical"
            aria-label={label}
            color="text"
            size="s"
            onClick={() => setIsOpen((v) => !v)}
            data-test-subj="workflowBottomBarToolsMenu"
          />
        </EuiToolTip>
      }
    >
      <div css={{ minWidth: 240 }}>
        {toolsSlot}
        {toolsMenuItems?.length ? (
          <div css={{ marginTop: toolsSlot ? euiTheme.size.s : 0 }}>
            {toolsMenuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  close();
                }}
                css={{
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  background: 'transparent',
                  padding: `${euiTheme.size.s} ${euiTheme.size.s}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: euiTheme.size.s,
                  alignItems: 'center',
                  '&:hover': { background: euiTheme.colors.backgroundBaseInteractiveHover },
                  '&:focus-visible': {
                    outline: `2px solid ${euiTheme.colors.primary}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <EuiIcon type={item.iconType} aria-hidden />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </EuiPopover>
  );
}

function VerticalDivider({
  fullHeight = false,
  fullBar = false,
}: {
  fullHeight?: boolean;
  /**
   * When true, the divider extends through the bar's vertical padding
   * (using a negative block margin), reaching the inside of the bar's
   * border. Inline margin is dropped so neighbours space themselves via
   * the parent's flex `gap` instead.
   */
  fullBar?: boolean;
}) {
  const { euiTheme } = useEuiTheme();
  return (
    <div
      aria-hidden
      css={{
        width: 1,
        height: fullBar ? `calc(100% + ${euiTheme.size.s} * 2)` : fullHeight ? '100%' : 32,
        marginBlock: fullBar ? `-${euiTheme.size.s}` : 0,
        marginInline: fullBar ? 0 : euiTheme.size.s,
        background: euiTheme.colors.borderBaseSubdued,
      }}
    />
  );
}

export function WorkflowDetailBottomBar({
  editorView,
  onEditorViewChange,
  yamlActionsSlot,
  toolsSlot,
  toolsMenuItems,
  testWorkflowButton,
  testWorkflowButtonCompact,
  bottomOffset = 0,
  disableAutoCollapse = false,
  showViewToggle = true,
}: WorkflowDetailBottomBarProps) {
  const { euiTheme } = useEuiTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w < COMPACT_THRESHOLD_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [isExpanded, setIsExpanded] = useState(true);
  const isInitialPhaseRef = useRef(true);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disableAutoCollapse) return undefined;
    const timer = setTimeout(() => {
      isInitialPhaseRef.current = false;
      setIsExpanded(false);
    }, 5000);
    return () => {
      clearTimeout(timer);
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [disableAutoCollapse]);

  // If the user flips the "Hide controls menu" setting OFF while the bar is
  // collapsed, snap it back to expanded immediately and cancel any pending
  // collapse timer.
  useEffect(() => {
    if (disableAutoCollapse) {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      setIsExpanded(true);
    }
  }, [disableAutoCollapse]);

  const handleExpandedMouseEnter = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
  }, []);

  const handleExpandedMouseLeave = useCallback(() => {
    if (disableAutoCollapse) return;
    if (!isInitialPhaseRef.current) {
      collapseTimerRef.current = setTimeout(() => setIsExpanded(false), 600);
    }
  }, [disableAutoCollapse]);

  const handlePillMouseEnter = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setIsExpanded(true);
  }, []);

  const barCss: CSSObject = {
    position: 'absolute',
    left: -2,
    right: -2,
    bottom: 12 + bottomOffset,
    zIndex: euiTheme.levels.header,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  };

  const pillLabel = i18n.translate('workflowsUi.bottomBar.expandControls', {
    defaultMessage: 'Show toolbar',
  });

  return (
    <WorkflowBottomBarContext.Provider value={{ isExpanded }}>
      <div ref={containerRef} css={barCss} data-test-subj="workflowDetailBottomBar">
        <div
          css={{
            pointerEvents: isExpanded ? 'auto' : 'none',
            opacity: isExpanded ? 1 : 0,
            transition: 'opacity 200ms ease',
            background: euiTheme.colors.backgroundBasePlain,
            borderRadius: 12,
            paddingBlock: euiTheme.size.s,
            paddingLeft: 12,
            paddingRight: euiTheme.size.s,
            boxShadow: BAR_SHADOW,
            display: 'inline-flex',
            maxWidth: 'min(980px, 100%)',
            position: 'relative',
            zIndex: 1,
          }}
          onMouseEnter={handleExpandedMouseEnter}
          onMouseLeave={handleExpandedMouseLeave}
        >
          <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center" wrap={false}>
            {/* Left section — yaml actions slot, only shown in yaml view. */}
            {yamlActionsSlot && editorView === 'yaml' ? (
              <>
                <EuiFlexItem grow={false}>{yamlActionsSlot}</EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <VerticalDivider />
                </EuiFlexItem>
              </>
            ) : null}

            {compact ? (
              <EuiFlexItem grow={false}>
                <CompactToolsMenu toolsMenuItems={toolsMenuItems} toolsSlot={toolsSlot} />
              </EuiFlexItem>
            ) : (
              <EuiFlexItem grow={false}>{toolsSlot}</EuiFlexItem>
            )}

            {showViewToggle ? (
              <>
                <EuiFlexItem grow={false}>
                  <VerticalDivider />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <ViewToggle editorView={editorView} onEditorViewChange={onEditorViewChange} />
                </EuiFlexItem>
              </>
            ) : null}

            {testWorkflowButton ? (
              <EuiFlexItem
                grow={false}
                css={{ alignSelf: 'stretch', display: 'flex', alignItems: 'stretch' }}
              >
                <VerticalDivider fullBar />
              </EuiFlexItem>
            ) : null}

            {testWorkflowButton ? (
              <EuiFlexItem grow={false}>
                {compact ? testWorkflowButtonCompact ?? testWorkflowButton : testWorkflowButton}
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </div>

        {/* Collapsed pill — hover to expand */}
        <div
          role="button"
          tabIndex={0}
          aria-label={pillLabel}
          css={{
            position: 'absolute',
            left: '50%',
            bottom: 0,
            transform: 'translateX(-50%)',
            pointerEvents: isExpanded ? 'none' : 'auto',
            opacity: isExpanded ? 0 : 1,
            transition: 'opacity 200ms ease',
            width: 64,
            height: 24,
            background: euiTheme.colors.primary,
            borderRadius: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: BAR_SHADOW,
            cursor: 'pointer',
          }}
          onMouseEnter={handlePillMouseEnter}
          onFocus={handlePillMouseEnter}
          onBlur={handleExpandedMouseLeave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePillMouseEnter();
            }
          }}
        >
          <EuiIcon
            type="boxesVertical"
            size="s"
            color={euiTheme.colors.emptyShade}
            css={{ transform: 'rotate(90deg)' }}
            aria-hidden
          />
        </div>
      </div>
    </WorkflowBottomBarContext.Provider>
  );
}
