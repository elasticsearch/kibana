/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { AttackDiscovery } from '@kbn/elastic-assistant-common';
import { EuiSpacer } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { ExpandableSection } from '../../../shared/components/expandable_section';
import { AttackChain } from '../../../../attack_discovery/pages/results/attack_discovery_panel/tabs/attack_discovery_tab/attack/attack_chain';
import { SectionPanel } from './section_panel';

const KEY = 'visualizations';
const STORAGE_KEY = 'securitySolution.attackDetailsFlyout.overviewSectionExpanded.v9.4';
const FIELD_MITRE_ATTACK_TACTICS = 'kibana.alert.attack_discovery.mitre_attack_tactics' as const;

export interface VisualizationsSectionProps {
  hit: DataTableRecord;
}

/**
 * Prop-driven Visualizations section for the attack flyout v2.
 * Reads the MITRE ATT&CK tactics from hit.flattened and renders the AttackChain component.
 */
export const VisualizationsSection = memo(({ hit }: VisualizationsSectionProps) => {
  const expanded = useExpandSection({
    storageKey: STORAGE_KEY,
    title: KEY,
    defaultValue: false,
  });

  const tacticsField = useMemo(
    () => hit.flattened[FIELD_MITRE_ATTACK_TACTICS] as AttackDiscovery['mitreAttackTactics'],
    [hit]
  );

  return (
    <ExpandableSection
      expanded={expanded}
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.overview.visualizationsSection.sectionTitle"
          defaultMessage="Visualizations"
        />
      }
      localStorageKey={STORAGE_KEY}
      sectionId={KEY}
      gutterSize="s"
      data-test-subj={KEY}
    >
      <SectionPanel
        title={
          <FormattedMessage
            id="xpack.securitySolution.flyoutV2.attack.overview.visualizationsSection.attackChainTitle"
            defaultMessage="Attack Chain"
          />
        }
      >
        <AttackChain isVertical attackTactics={tacticsField} />
      </SectionPanel>
      <EuiSpacer size="s" />
    </ExpandableSection>
  );
});

VisualizationsSection.displayName = 'VisualizationsSection';
