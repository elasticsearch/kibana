/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const COVERAGE_OVERVIEW_DASHBOARD_TITLE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.pageTitle',
  {
    defaultMessage: 'MITRE ATT&CK\u00AE coverage',
  }
);

export const COLLAPSE_CELLS_FILTER_BUTTON = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.collapseCellsButton',
  {
    defaultMessage: 'Collapse cells',
  }
);

export const EXPAND_CELLS_FILTER_BUTTON = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.expandCellsButton',
  {
    defaultMessage: 'Expand cells',
  }
);

export const DISABLED_RULES_METADATA_LABEL = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.disabledRulesMetadataLabel',
  {
    defaultMessage: 'Disabled Rules:',
  }
);

export const ENABLED_RULES_METADATA_LABEL = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.enabledRulesMetadataLabel',
  {
    defaultMessage: 'Enabled Rules:',
  }
);

export const SUBTECHNIQUES = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.subtechniques',
  {
    defaultMessage: 'Sub-techniques',
  }
);

export const ENABLE_ALL_DISABLED = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.enableAllDisabledButtonLabel',
  {
    defaultMessage: 'Enable all disabled',
  }
);

export const COVERED_MITRE_TECHNIQUES = (enabledTechniques: number, totalTechniques: number) =>
  i18n.translate('xpack.securitySolution.coverageOverviewDashboard.coveredMitreTechniques', {
    values: { enabledTechniques, totalTechniques },
    defaultMessage: '{enabledTechniques}/{totalTechniques} techniques',
  });

export const COVERED_MITRE_SUBTECHNIQUES = (
  enabledSubtechniques: number,
  totalSubtechniques: number
) =>
  i18n.translate('xpack.securitySolution.coverageOverviewDashboard.coveredMitreSubtechniques', {
    values: { enabledSubtechniques, totalSubtechniques },
    defaultMessage: 'Sub-techniques {enabledSubtechniques}/{totalSubtechniques}',
  });

export const DISABLED_RULES_LIST_LABEL = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.disabledRulesListLabel',
  {
    defaultMessage: 'Disabled rules',
  }
);

export const ENABLED_RULES_LIST_LABEL = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.enabledRulesListLabel',
  {
    defaultMessage: 'Enabled rules',
  }
);

export const CoverageOverviewLegendTitle = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.legendTitle',
  {
    defaultMessage: 'Legend',
  }
);

export const CoverageOverviewLegendSubtitle = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.legendSubtitle',
  {
    defaultMessage: '(count will include all rules selected)',
  }
);

export const CoverageOverviewLegendRulesLabel = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.legendRulesLabel',
  {
    defaultMessage: 'rules',
  }
);

export const CoverageOverviewEnabledRuleActivity = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.enabledRuleActivity',
  {
    defaultMessage: 'Enabled rules',
  }
);

export const CoverageOverviewDisabledRuleActivity = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.disabledRuleActivity',
  {
    defaultMessage: 'Disabled rules',
  }
);

export const CoverageOverviewElasticRuleSource = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.elasticRuleSource',
  {
    defaultMessage: 'Elastic rules',
  }
);

export const CoverageOverviewCustomRuleSource = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.customRuleSource',
  {
    defaultMessage: 'Custom rules',
  }
);

export const CoverageOverviewRuleActivityFilterLabel = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.ruleActivityFilterLabel',
  {
    defaultMessage: 'Installed rule status',
  }
);

export const CoverageOverviewRuleSourceFilterLabel = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.ruleSourceFilterLabel',
  {
    defaultMessage: 'Installed rule type',
  }
);

export const CoverageOverviewSearchBarPlaceholder = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.searchBarPlaceholder',
  {
    defaultMessage:
      'Search for the tactic, technique (e.g.,"Defense Evasion" or "TA0005") or rule name',
  }
);

export const CoverageOverviewFilterPopoverTitle = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.filterPopoverTitle',
  {
    defaultMessage: 'Select to view on framework',
  }
);

export const CoverageOverviewFilterPopoverClearAll = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.filterPopoverClearAll',
  {
    defaultMessage: 'Clear all',
  }
);

export const CoverageOverviewDashboardInformation = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.dashboardInformation',
  {
    defaultMessage:
      "Your current coverage of MITRE ATT&CK\u00AE tactics and techniques, based on installed rules. Click a cell to view and enable a technique's rules. Rules must be mapped to the MITRE ATT&CK\u00AE framework to be displayed.",
  }
);

export const COVERAGE_OVERVIEW_FETCH_ERROR_TITLE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.fetchErrorTitle',
  {
    defaultMessage: 'Failed to fetch coverage overview data',
  }
);

export const INVALID_MITRE_RULES_CALLOUT_TITLE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesCallout.title',
  {
    defaultMessage: 'Some rules have outdated MITRE ATT&CK\u00AE mappings',
  }
);

export const INVALID_MITRE_RULES_CALLOUT_DESCRIPTION_LEARN_MORE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesCallout.descriptionLearnMore',
  {
    defaultMessage: 'Learn more',
  }
);

export const INVALID_MITRE_RULES_CALLOUT_PREBUILT_NOTICE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesCallout.prebuiltNotice',
  {
    defaultMessage:
      'Elastic prebuilt rule mappings were updated for this MITRE ATT&CK\u00AE version. Make sure to install the latest prebuilt rule updates so their coverage stays accurate.',
  }
);

export const INVALID_MITRE_RULES_VIEW_RULES_BUTTON = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesCallout.viewRulesButton',
  {
    defaultMessage: 'View rules',
  }
);

export const INVALID_MITRE_RULES_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesModal.title',
  {
    defaultMessage: 'Rules with outdated MITRE mappings',
  }
);

export const INVALID_MITRE_RULES_MODAL_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesModal.description',
  {
    defaultMessage:
      'These rules reference MITRE ATT&CK\u00AE tactic, technique, or sub-technique IDs that are not present in the currently supported version. They may not appear correctly in the coverage matrix. Open each rule to update its mappings.',
  }
);

export const INVALID_MITRE_RULES_MODAL_CLOSE = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesModal.closeButton',
  {
    defaultMessage: 'Close',
  }
);

export const INVALID_MITRE_RULES_MODAL_ENABLED_SECTION = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesModal.enabledSection',
  {
    defaultMessage: 'Enabled rules',
  }
);

export const INVALID_MITRE_RULES_MODAL_DISABLED_SECTION = i18n.translate(
  'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesModal.disabledSection',
  {
    defaultMessage: 'Disabled rules',
  }
);

export const INVALID_MITRE_ID_BADGE_TOOLTIP = (id: string) =>
  i18n.translate(
    'xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesModal.invalidMitreIdBadgeTooltip',
    {
      values: { id },
      defaultMessage: 'Open MITRE ATT&CK\u00AE reference for {id}',
    }
  );
