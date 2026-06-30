/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiAccordion,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { tacticOrder as mitreTacticOrder } from '../../../../common/detection_engine/mitre/mitre_tactics_order';
import { tactics as mitreTactics } from '../../../../common/detection_engine/mitre/mitre_tactics_techniques';
import { AnomaliesSwimlane } from './anomalies_swimlane';
import { ENTITY_ANOMALY_TIMELINE_TITLE } from './translations';
import { useAnomalyBands } from '../recent_anomalies/anomaly_bands';
import { getAnomalyChartStyling } from '../recent_anomalies';

const tacticNames = [...mitreTactics]
  .sort((a, b) => mitreTacticOrder.indexOf(a.id) - mitreTacticOrder.indexOf(b.id))
  .map(({ name }) => name);

const TACTIC_ACCESSOR = 'mitre_tactic';

interface AnomalyTabTimelineProps {
  anomalies: Array<{ timestamp: string; maxScore: number; threatTactics?: string[] }>;
  selectedTactic?: string | null;
  timeRangeMs: { from: number; to: number };
}

export const AnomalyTabTimelineSection: React.FC<AnomalyTabTimelineProps> = ({
  anomalies,
  selectedTactic,
  timeRangeMs,
}) => {
  const { bands } = useAnomalyBands();
  const styling = getAnomalyChartStyling(true);

  const mitreTacticNames = useMemo(() => {
    if (selectedTactic && tacticNames.includes(selectedTactic)) {
      return [selectedTactic];
    }
    const tacticsWithAnomalies = new Set(anomalies.flatMap((a) => a.threatTactics ?? []));
    return tacticNames.filter((t) => tacticsWithAnomalies.has(t));
  }, [selectedTactic, anomalies]);
  const mitreTacticLabels = useMemo(
    () =>
      mitreTacticNames.map((mitreTacticName) => ({ id: mitreTacticName, label: mitreTacticName })),
    [mitreTacticNames]
  );

  const records = useMemo(() => {
    const byTactic = new Map<string, Array<{ '@timestamp': number; record_score: number }>>();
    for (const a of anomalies) {
      for (const tactic of a.threatTactics ?? []) {
        const entry = { '@timestamp': new Date(a.timestamp).getTime(), record_score: a.maxScore };
        const existing = byTactic.get(tactic);
        if (existing) {
          existing.push(entry);
        } else {
          byTactic.set(tactic, [entry]);
        }
      }
    }

    return mitreTacticNames.flatMap((tactic) => {
      const entries = byTactic.get(tactic);
      if (entries) {
        return entries.map((e) => ({ ...e, [TACTIC_ACCESSOR]: tactic }));
      }
      return [{ '@timestamp': timeRangeMs.from, [TACTIC_ACCESSOR]: tactic, record_score: 0 }];
    });
  }, [anomalies, mitreTacticNames, timeRangeMs.from]);

  return (
    <div>
      <EuiAccordion
        id="entity-anomalies-tab-timeline-accordion"
        initialIsOpen
        buttonContent={
          <EuiTitle size="xs">
            <h3>{ENTITY_ANOMALY_TIMELINE_TITLE}</h3>
          </EuiTitle>
        }
      >
        <EuiSpacer size="m" />
        <EuiFlexGroup>
          <EuiFlexItem
            css={css`
              height: ${styling.heightOfEntityNamesList(mitreTacticLabels.length)}px;
            `}
            grow={false}
          >
            <EuiFlexGroup gutterSize="none" direction="column" justifyContent="center">
              {mitreTacticLabels.map((row) => (
                <EuiFlexItem
                  key={row.id}
                  css={css`
                    justify-content: center;
                    height: ${styling.heightOfEachCell}px;
                  `}
                  grow={false}
                >
                  <EuiToolTip content={row.label}>
                    <EuiText
                      textAlign="right"
                      tabIndex={0}
                      size="xs"
                      css={css`
                        max-width: 140px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                      `}
                    >
                      {row.label}
                    </EuiText>
                  </EuiToolTip>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
          <AnomaliesSwimlane
            anomalyBands={bands}
            records={records}
            from={timeRangeMs.from}
            to={timeRangeMs.to}
            yAxisNames={mitreTacticNames}
            yAxisAccessor={TACTIC_ACCESSOR}
            heatmapId="entity-anomalies-tab-timeline-heatmap"
            ySortPredicate="dataIndex"
          />
        </EuiFlexGroup>
      </EuiAccordion>
    </div>
  );
};
