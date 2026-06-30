/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { ENTITY_ANOMALY_TABLE_TACTIC_POPOVER_TITLE } from '../translations';

interface AnomalyTacticBadgesProps {
  tactics: string[];
}

const CLOSE_DELAY_MS = 100;

export const AnomalyTacticBadges: React.FC<AnomalyTacticBadgesProps> = ({ tactics }) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  const open = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setIsOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const overflowCount = useMemo(() => Math.max(0, tactics.length - 1), [tactics.length]);

  if (tactics.length === 0) {
    return null;
  }

  const firstTactic = tactics[0];

  return (
    <EuiFlexGroup
      gutterSize="xs"
      responsive={false}
      alignItems="center"
      css={css`
        flex-wrap: nowrap;
        min-width: 0;
      `}
    >
      <EuiFlexItem
        grow={1}
        css={css`
          min-width: 0;
        `}
      >
        <EuiToolTip
          content={firstTactic}
          anchorProps={{
            css: css`
              display: block;
              min-width: 0;
              max-width: 100%;
            `,
          }}
        >
          <EuiBadge
            tabIndex={0}
            color="hollow"
            css={css`
              max-width: 100%;
              & .euiBadge__content,
              & .euiBadge__text {
                min-width: 0;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                display: block;
              }
            `}
          >
            {firstTactic}
          </EuiBadge>
        </EuiToolTip>
      </EuiFlexItem>
      {overflowCount > 0 && (
        <EuiFlexItem grow={false}>
          <EuiPopover
            isOpen={isOpen}
            aria-label={ENTITY_ANOMALY_TABLE_TACTIC_POPOVER_TITLE}
            closePopover={close}
            panelPaddingSize="s"
            anchorPosition="downCenter"
            ownFocus={false}
            button={
              <span
                role="button"
                tabIndex={0}
                onMouseEnter={open}
                onMouseLeave={scheduleClose}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen((prev) => !prev);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen((prev) => !prev);
                  }
                }}
              >
                <EuiBadge color="hollow">{`+${overflowCount}`}</EuiBadge>
              </span>
            }
          >
            <div
              onMouseEnter={open}
              onMouseLeave={scheduleClose}
              css={css`
                max-width: 320px;
              `}
            >
              <EuiPopoverTitle>{ENTITY_ANOMALY_TABLE_TACTIC_POPOVER_TITLE}</EuiPopoverTitle>
              <EuiBadgeGroup
                gutterSize="xs"
                css={css`
                  max-height: 200px;
                  overflow: auto;
                `}
              >
                {tactics.map((tactic) => (
                  <EuiBadge color="hollow" key={tactic}>
                    {tactic}
                  </EuiBadge>
                ))}
              </EuiBadgeGroup>
            </div>
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
