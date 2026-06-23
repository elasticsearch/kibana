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
import { useExpandSection } from '../../../flyout_v2/shared/hooks/use_expand_section';
import { ExpandableSection } from '../../../flyout_v2/shared/components/expandable_section';
import { FLYOUT_STORAGE_KEYS } from '../constants/local_storage';
import { AttackChain } from '../../../attack_discovery/pages/results/attack_discovery_panel/tabs/attack_discovery_tab/attack/attack_chain';
import { useAttackDetailsContext } from '../context';
import { SectionPanel } from '../../../flyout_v2/attack/main/components/section_panel';

const KEY = 'visualizations';

/**
 * Renders the Overview tab - VisualizationsSection content in the Attack Details flyout.
 */
export const VisualizationsSection = memo(() => {
  const expanded = useExpandSection({
    storageKey: FLYOUT_STORAGE_KEYS.ATTACK_DETAILS_OVERVIEW_TAB_EXPANDED_SECTIONS,
    title: KEY,
    defaultValue: false,
  });
  const { getFieldsData } = useAttackDetailsContext();

  const tacticsField = useMemo(
    () =>
      getFieldsData(
        'kibana.alert.attack_discovery.mitre_attack_tactics'
      ) as AttackDiscovery['mitreAttackTactics'],
    [getFieldsData]
  );

  return (
    <ExpandableSection
      expanded={expanded}
      title={
        <FormattedMessage
          id="xpack.securitySolution.attackDetailsFlyout.overview.visualizationsSection.sectionTitle"
          defaultMessage="Visualizations"
        />
      }
      localStorageKey={FLYOUT_STORAGE_KEYS.ATTACK_DETAILS_OVERVIEW_TAB_EXPANDED_SECTIONS}
      sectionId={KEY}
      gutterSize="s"
      data-test-subj={KEY}
    >
      <SectionPanel
        title={
          <FormattedMessage
            id="xpack.securitySolution.attackDetailsFlyout.overview.visualizationsSection.attackChainTitle"
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
