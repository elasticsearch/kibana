/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { isNonLocalIndexName } from '@kbn/es-query';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { documentFlyoutHistoryKey } from '../../../shared/constants/flyout_history';
import { defaultToolsFlyoutProperties } from '../../../shared/hooks/use_default_flyout_properties';
import { EventKind } from '../constants/event_kinds';
import { FLYOUT_STORAGE_KEYS } from '../constants/local_storage';
import { useKibana } from '../../../../common/lib/kibana';
import type { CellActionRenderer } from '../../../shared/components/cell_actions';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { ExpandableSection } from '../../../shared/components/expandable_section';
import { PREFIX } from '../../../../flyout/shared/test_ids';
import { InvestigationGuide } from './investigation_guide';
import { InvestigationGuide as InvestigationGuideToolsFlyout } from '../../tools/investigation_guide';
import { flyoutProviders } from '../../../shared/components/flyout_provider';
import { HighlightedFields } from './highlighted_fields';
import { useRuleWithFallback } from '../../../../detection_engine/rule_management/logic/use_rule_with_fallback';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import type { OpenFlyoutLinkProps } from '../../../shared/components/open_flyout_link';
import { OpenFlyoutLink } from '../../../shared/components/open_flyout_link';
import { HOST_NAME_FIELD_NAME } from '../../../../timelines/components/timeline/body/renderers/constants';

export const INVESTIGATION_SECTION_TEST_ID = `${PREFIX}InvestigationSection` as const;

export const INVESTIGATION_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.flyout.document.investigation.sectionTitle',
  {
    defaultMessage: 'Investigation',
  }
);

const LOCAL_STORAGE_SECTION_KEY = 'investigation';

export interface InvestigationSectionProps {
  /**
   * Document to display in the overview tab
   */
  hit: DataTableRecord;
  /**
   * Render function for cell actions. The caller decides what to inject
   * (real security cell actions in Security Solution, no-op in Discover).
   */
  renderCellActions: CellActionRenderer;
}

/**
 * Second section of the overview tab in details flyout.
 * It contains investigation guide (alerts only) and highlighted fields.
 */
export const InvestigationSection = memo(
  ({ hit, renderCellActions }: InvestigationSectionProps) => {
    const { services } = useKibana();
    const { overlays } = services;
    const store = useStore();
    const history = useHistory();
    const isInSecurityApp = useIsInSecurityApp();
    const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;

    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );
    const isRemoteDocument = useMemo(
      () => isNonLocalIndexName(hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''),
      [hit]
    );
    const ruleId = useMemo(
      () =>
        (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal
          ? (getFieldValue(hit, 'kibana.alert.rule.uuid') as string)
          : (getFieldValue(hit, 'signal.rule.id') as string),
      [hit]
    );
    const { rule } = useRuleWithFallback(ruleId);
    const investigationFields = useMemo(
      () => rule?.investigation_fields?.field_names ?? [],
      [rule?.investigation_fields?.field_names]
    );
    const ancestorsIndexName = useMemo(
      () => (getFieldValue(hit, 'signal.ancestors.index') as string) ?? '',
      [hit]
    );

    const expanded = useExpandSection({
      storageKey: FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS,
      title: LOCAL_STORAGE_SECTION_KEY,
      defaultValue: true,
    });

    const onShowInvestigationGuide = useCallback(() => {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: <InvestigationGuideToolsFlyout hit={hit} />,
        }),
        {
          ...defaultToolsFlyoutProperties,
          historyKey,
          session: 'start',
        }
      );
    }, [history, historyKey, hit, overlays, services, store]);

    const renderFlyoutLink = useCallback(
      (props: OpenFlyoutLinkProps) => (
        <OpenFlyoutLink {...props} asParent={props.field === HOST_NAME_FIELD_NAME} />
      ),
      []
    );

    return (
      <ExpandableSection
        data-test-subj={INVESTIGATION_SECTION_TEST_ID}
        expanded={expanded}
        gutterSize="s"
        localStorageKey={FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS}
        sectionId={LOCAL_STORAGE_SECTION_KEY}
        title={INVESTIGATION_SECTION_TITLE}
      >
        {isAlert && !isRemoteDocument ? (
          <InvestigationGuide
            hit={hit}
            isAvailable={true}
            onShowInvestigationGuide={onShowInvestigationGuide}
          />
        ) : null}
        <HighlightedFields
          hit={hit}
          investigationFields={investigationFields}
          ancestorsIndexName={ancestorsIndexName}
          renderCellActions={renderCellActions}
          hideEditButton={isRemoteDocument}
          renderFlyoutLink={renderFlyoutLink}
        />
      </ExpandableSection>
    );
  }
);

InvestigationSection.displayName = 'InvestigationSection';
