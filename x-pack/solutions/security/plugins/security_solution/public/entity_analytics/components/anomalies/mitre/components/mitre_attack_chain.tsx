/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { css } from '@emotion/react';
import { tacticOrder as mitreTacticOrder } from '../../../../../../common/detection_engine/mitre/mitre_tactics_order';
import { tactics as mitreTactics } from '../../../../../../common/detection_engine/mitre/mitre_tactics_techniques';
import { MitreTacticDot } from './mitre_tactic_dot';

const tacticNames = [...mitreTactics]
  .sort((a, b) => mitreTacticOrder.indexOf(a.id) - mitreTacticOrder.indexOf(b.id))
  .map(({ name }) => name);

interface MitreAttackChainProps {
  anomalyCountByTactic?: Readonly<Record<string, number>>;
  onSelectTactic?: (tactic: string) => void;
  selectedTactic?: string | null;
  showLabels?: boolean;
  triggeredTactics: readonly string[];
}

export const MitreAttackChain: React.FC<MitreAttackChainProps> = ({
  anomalyCountByTactic,
  onSelectTactic,
  selectedTactic,
  showLabels = false,
  triggeredTactics,
}) => {
  const triggeredSet = useMemo(() => new Set(triggeredTactics), [triggeredTactics]);

  // Forwarded to every MitreTacticDot component so each dot can detect whether
  // its default left-aligned hover chip would overflow this container's
  // right edge; when it would, the dot flips its chip to right alignment
  // so it stays fully visible.
  const containerRef = useRef<HTMLDivElement | null>(null);

  // First tactic in attack-chain order with a non-zero anomaly count — its
  // hover chip is shown persistently (without hover) by default, but only
  // when no tactic is selected (the selected tactic's chip is already visible).
  // Falls back to `null` when no tactic has anomalies.
  const firstActiveTactic = useMemo<string | null>(() => {
    if (!anomalyCountByTactic) return null;
    for (const t of tacticNames) {
      if ((anomalyCountByTactic[t] ?? 0) > 0) return t;
    }
    return null;
  }, [anomalyCountByTactic]);

  const [hoveredTactic, setHoveredTactic] = useState<string | null>(null);
  const handleHoverChange = useCallback((tactic: string, isHovered: boolean) => {
    setHoveredTactic((prev) => {
      if (isHovered) return tactic;
      // Only clear when the leave event matches the currently-tracked
      // tactic — protects against stale leave events arriving after a
      // newer enter has already updated state.
      return prev === tactic ? null : prev;
    });
  }, []);

  return (
    <div
      ref={containerRef}
      css={css`
        width: 100%;
        min-width: 0;
        padding-left: 4px;
        padding-right: 4px;
      `}
    >
      <EuiFlexGroup gutterSize="none" responsive={false} wrap={false} alignItems="flexStart">
        {tacticNames.map((tactic, index) => {
          const isDetected = triggeredSet.has(tactic);
          const isClickable = !!onSelectTactic && isDetected;
          return (
            <EuiFlexItem
              key={tactic}
              grow
              css={css`
                min-width: 0;
              `}
            >
              <MitreTacticDot
                tactic={tactic}
                detected={isDetected}
                showLabel={showLabels}
                isLast={index === tacticNames.length - 1}
                anomalyCount={anomalyCountByTactic?.[tactic]}
                isSelected={selectedTactic === tactic}
                isClickable={isClickable}
                onClick={isClickable ? () => onSelectTactic?.(tactic) : undefined}
                containerRef={containerRef}
                isPersistentDefault={tactic === firstActiveTactic && !selectedTactic}
                isAnotherDotHovered={hoveredTactic !== null && hoveredTactic !== tactic}
                onHoverChange={handleHoverChange}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </div>
  );
};
