/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isArray, parseInt } from 'lodash';

import type {
  RuleIntervalFrom,
  Threat,
  ThreatSubtechnique,
  ThreatTechnique,
} from '@kbn/securitysolution-io-ts-alerting-types';
import type {
  EqlRuleCreateProps,
  EsqlRuleCreateProps,
  MachineLearningRuleCreateProps,
  NewTermsRuleCreateProps,
  QueryRuleCreateProps,
  RuleCreateProps,
  ThreatMatchRuleCreateProps,
  ThresholdRuleCreateProps,
} from '@kbn/security-solution-plugin/common/api/detection_engine/model';
import type { Actions, AlertsFilter } from '../objects/types';
// For some reason importing these functions from ../../public/detection_engine/common/helpers
// causes a "Webpack Compilation Error" in this file specifically, even though it imports fine in the test files
// in ../e2e/*, so we have a copy of the implementations in the cypress helpers.
import { convertHistoryStartToSize, getHumanizedDuration } from '../helpers/rules';

import {
  ABOUT_CONTINUE_BTN,
  ABOUT_EDIT_TAB,
  ACTIONS_EDIT_TAB,
  ADD_FALSE_POSITIVE_BTN,
  ADD_REFERENCE_URL_BTN,
  ADVANCED_SETTINGS_BTN,
  ALERT_SUPPRESSION_DURATION_PER_RULE_EXECUTION,
  ALERT_SUPPRESSION_DURATION_PER_TIME_INTERVAL,
  ALERT_SUPPRESSION_DURATION_UNIT_INPUT,
  ALERT_SUPPRESSION_DURATION_VALUE_INPUT,
  ALERT_SUPPRESSION_FIELDS,
  ALERT_SUPPRESSION_FIELDS_COMBO_BOX,
  ALERT_SUPPRESSION_FIELDS_INPUT,
  ALERT_SUPPRESSION_MISSING_FIELDS_DO_NOT_SUPPRESS,
  ALERTS_INDEX_BUTTON,
  ANOMALY_THRESHOLD_INPUT,
  APPLY_SELECTED_SAVED_QUERY_BUTTON,
  AT_LEAST_ONE_INDEX_PATTERN,
  AT_LEAST_ONE_VALID_MATCH,
  COMBO_BOX_CLEAR_BTN,
  CREATE_AND_ENABLE_BTN,
  CREATE_WITHOUT_ENABLING_BTN,
  CUSTOM_INDEX_PATTERN_INPUT,
  CUSTOM_QUERY_INPUT,
  CUSTOM_QUERY_REQUIRED,
  DATA_VIEW_COMBO_BOX,
  DATA_VIEW_OPTION,
  DEFAULT_RISK_SCORE_INPUT,
  DEFINE_CONTINUE_BUTTON,
  EQL_QUERY_INPUT,
  EQL_QUERY_VALIDATION_SPINNER,
  EQL_TYPE,
  ESQL_QUERY_BAR,
  ESQL_QUERY_BAR_INPUT_AREA,
  ESQL_TYPE,
  FALSE_POSITIVES_INPUT,
  IMPORT_QUERY_FROM_SAVED_TIMELINE_LINK,
  INDICATOR_MATCH_TYPE,
  INPUT,
  INVALID_MATCH_CONTENT,
  INVESTIGATION_NOTES_TEXTAREA,
  INVESTIGATIONS_INPUT,
  LOAD_QUERY_DYNAMICALLY_CHECKBOX,
  LOAD_SAVED_QUERIES_LIST_BUTTON,
  LOOK_BACK_INTERVAL,
  LOOK_BACK_TIME_TYPE,
  MACHINE_LEARNING_DROPDOWN_INPUT,
  MACHINE_LEARNING_TYPE,
  MAX_SIGNALS_INPUT,
  MITRE_ATTACK_ADD_SUBTECHNIQUE_BUTTON,
  MITRE_ATTACK_ADD_TACTIC_BUTTON,
  MITRE_ATTACK_ADD_TECHNIQUE_BUTTON,
  MITRE_ATTACK_SUBTECHNIQUE_DROPDOWN,
  MITRE_ATTACK_TACTIC_DROPDOWN,
  MITRE_ATTACK_TECHNIQUE_DROPDOWN,
  MITRE_TACTIC,
  NEW_TERMS_HISTORY_SIZE,
  NEW_TERMS_HISTORY_TIME_TYPE,
  NEW_TERMS_INPUT_AREA,
  NEW_TERMS_TYPE,
  PREVIEW_HISTOGRAM,
  PREVIEW_LOGGED_REQUESTS_ACCORDION_BUTTON,
  PREVIEW_LOGGED_REQUESTS_CHECKBOX,
  PREVIEW_LOGGED_REQUESTS_ITEM_ACCORDION_BUTTON,
  PREVIEW_LOGGED_REQUESTS_PAGE_ACCORDION_BUTTON,
  QUERY_BAR,
  QUERY_BAR_ADD_FILTER,
  REFERENCE_URLS_INPUT,
  RELATED_INTEGRATION_COMBO_BOX_INPUT,
  REQUIRED_FIELD_COMBO_BOX_INPUT,
  RISK_MAPPING_OVERRIDE_OPTION,
  RISK_OVERRIDE,
  RULE_DESCRIPTION_INPUT,
  RULE_INDICES,
  RULE_NAME_INPUT,
  RULE_NAME_OVERRIDE,
  RULE_NAME_OVERRIDE_FOR_ESQL,
  RULE_TIMESTAMP_OVERRIDE,
  RULES_CREATION_FORM,
  RULES_CREATION_PREVIEW_BUTTON,
  RULES_CREATION_PREVIEW_REFRESH_BUTTON,
  RUNS_EVERY_INTERVAL,
  RUNS_EVERY_TIME_TYPE,
  SAVE_WITH_ERRORS_MODAL,
  SAVE_WITH_ERRORS_MODAL_CONFIRM_BTN,
  savedQueryByName,
  SCHEDULE_CONTINUE_BUTTON,
  SCHEDULE_EDIT_TAB,
  SETUP_GUIDE_TEXTAREA,
  SEVERITY_DROPDOWN,
  SEVERITY_MAPPING_OVERRIDE_OPTION,
  SEVERITY_OVERRIDE_ROW,
  SHOW_QUERY_BAR_BUTTON,
  TAGS_INPUT,
  THREAT_COMBO_BOX_INPUT,
  THREAT_ITEM_ENTRY_DELETE_BUTTON,
  THREAT_MAPPING_COMBO_BOX_INPUT,
  THREAT_MATCH_AND_BUTTON,
  THREAT_MATCH_CUSTOM_QUERY_INPUT,
  THREAT_MATCH_INDICATOR_INDICATOR_INDEX,
  THREAT_MATCH_OR_BUTTON,
  THREAT_MATCH_QUERY_INPUT,
  THREAT_MATCH_QUERY_REQUIRED,
  THREAT_MATCH_OPERATOR_SELECT,
  THRESHOLD_ENABLE_SUPPRESSION_CHECKBOX,
  THRESHOLD_INPUT_AREA,
  THRESHOLD_TYPE,
} from '../screens/create_new_rule';
import {
  ACTIONS_ALERTS_QUERY_FILTER_BUTTON,
  ACTIONS_ALERTS_QUERY_FILTER_INPUT,
  ACTIONS_ALERTS_TIMEFRAME_END_INPUT,
  ACTIONS_ALERTS_TIMEFRAME_FILTER_BUTTON,
  ACTIONS_ALERTS_TIMEFRAME_START_INPUT,
  ACTIONS_ALERTS_TIMEFRAME_TIMEZONE_INPUT,
  ACTIONS_ALERTS_TIMEFRAME_WEEKDAY_BUTTON,
  CASES_SYSTEM_ACTION_BTN,
  CREATE_ACTION_CONNECTOR_BTN,
  EMAIL_ACTION_BTN,
  INDEX_SELECTOR,
} from '../screens/common/rule_actions';
import { fillEmailConnectorForm, fillIndexConnectorForm } from './common/rule_actions';
import { TOAST_ERROR } from '../screens/shared';
import { ALERTS_TABLE_COUNT } from '../screens/timeline';
import { TIMELINE } from '../screens/timelines';
import { COMBO_BOX_INPUT, EUI_FILTER_SELECT_ITEM } from '../screens/common/controls';
import { ruleFields } from '../data/detection_engine';
import { waitForAlerts } from './alerts';
import { COMBO_BOX_OPTION, TOOLTIP } from '../screens/common';
import { EMPTY_ALERT_TABLE } from '../screens/alerts';
import { fillComboBox } from './eui_form_interactions';
import { refreshPage } from './security_header';

export const createAndEnableRule = () => {
  cy.get(CREATE_AND_ENABLE_BTN).click();
  cy.get(CREATE_AND_ENABLE_BTN).should('not.exist');
};

export const createRuleWithoutEnabling = () => {
  cy.get(CREATE_WITHOUT_ENABLING_BTN).click();
  cy.get(CREATE_WITHOUT_ENABLING_BTN).should('not.exist');
};

export const createRuleWithNonBlockingErrors = () => {
  cy.get(CREATE_AND_ENABLE_BTN).click();
  cy.get(SAVE_WITH_ERRORS_MODAL).should('exist');
  cy.get(SAVE_WITH_ERRORS_MODAL_CONFIRM_BTN).first().click();
  cy.get(SAVE_WITH_ERRORS_MODAL).should('not.exist');
  cy.get(CREATE_AND_ENABLE_BTN).should('not.exist');
};

export const fillAboutRule = (rule: RuleCreateProps) => {
  cy.get(RULE_NAME_INPUT).clear({ force: true });
  cy.get(RULE_NAME_INPUT).type(rule.name, { force: true });
  cy.get(RULE_DESCRIPTION_INPUT).clear({ force: true });
  cy.get(RULE_DESCRIPTION_INPUT).type(rule.description, { force: true });

  if (rule.severity) {
    fillSeverity(rule.severity);
  }
  if (rule.risk_score) {
    fillRiskScore(rule.risk_score);
  }
  if (rule.tags) {
    fillRuleTags(rule.tags);
  }
  cy.get(ADVANCED_SETTINGS_BTN).click({ force: true });

  if (rule.references) {
    fillReferenceUrls(rule.references);
  }

  if (rule.false_positives) {
    fillFalsePositiveExamples(rule.false_positives);
  }

  if (rule.threat) {
    fillMitre(rule.threat);
  }
  if (rule.note) {
    fillNote(rule.note);
  }
};

export const expandAdvancedSettings = () => {
  cy.get(ADVANCED_SETTINGS_BTN).click({ force: true });
};

export const fillMaxSignals = (maxSignals: number = ruleFields.maxSignals) => {
  cy.get(MAX_SIGNALS_INPUT).clear({ force: true });
  cy.get(MAX_SIGNALS_INPUT).type(maxSignals.toString());

  return maxSignals;
};

export const fillNote = (note: string = ruleFields.investigationGuide) => {
  cy.get(INVESTIGATION_NOTES_TEXTAREA).clear({ force: true });
  cy.get(INVESTIGATION_NOTES_TEXTAREA).type(note, { force: true });

  return note;
};

export const fillSetup = (setup: string = ruleFields.setup) => {
  cy.get(SETUP_GUIDE_TEXTAREA).clear({ force: true });
  cy.get(SETUP_GUIDE_TEXTAREA).type(setup);

  return setup;
};

export const fillMitre = (mitreAttacks: Threat[]) => {
  let techniqueIndex = 0;
  let subtechniqueInputIndex = 0;
  mitreAttacks.forEach((mitre, tacticIndex) => {
    cy.get(MITRE_ATTACK_TACTIC_DROPDOWN).eq(tacticIndex).click({ force: true });
    cy.contains(MITRE_TACTIC, `${mitre.tactic.name} (${mitre.tactic.id})`).click();

    if (mitre.technique) {
      mitre.technique.forEach((technique) => {
        cy.get(MITRE_ATTACK_ADD_TECHNIQUE_BUTTON).eq(tacticIndex).click({ force: true });
        cy.get(MITRE_ATTACK_TECHNIQUE_DROPDOWN).eq(techniqueIndex).click({ force: true });
        cy.contains(MITRE_TACTIC, `${technique.name} (${technique.id})`).click();
        if (technique.subtechnique) {
          technique.subtechnique.forEach((subtechnique) => {
            cy.get(MITRE_ATTACK_ADD_SUBTECHNIQUE_BUTTON).eq(techniqueIndex).click({ force: true });
            cy.get(MITRE_ATTACK_SUBTECHNIQUE_DROPDOWN)
              .eq(subtechniqueInputIndex)
              .click({ force: true });
            cy.contains(MITRE_TACTIC, `${subtechnique.name} (${subtechnique.id})`).click();
            subtechniqueInputIndex++;
          });
          techniqueIndex++;
        }
      });
    }

    cy.get(MITRE_ATTACK_ADD_TACTIC_BUTTON).click({ force: true });
  });
  return mitreAttacks;
};

export const fillThreat = (threat: Threat = ruleFields.threat) => {
  cy.get(MITRE_ATTACK_TACTIC_DROPDOWN).first().click({ force: true });
  cy.contains(MITRE_TACTIC, threat.tactic.name).click();
  return threat;
};

export const fillThreatTechnique = (technique: ThreatTechnique = ruleFields.threatTechnique) => {
  cy.get(MITRE_ATTACK_ADD_TECHNIQUE_BUTTON).first().click({ force: true });
  cy.get(MITRE_ATTACK_TECHNIQUE_DROPDOWN).first().click({ force: true });
  cy.contains(MITRE_TACTIC, technique.name).click();
  return technique;
};

export const fillThreatSubtechnique = (
  subtechnique: ThreatSubtechnique = ruleFields.threatSubtechnique
) => {
  cy.get(MITRE_ATTACK_ADD_SUBTECHNIQUE_BUTTON).first().click({ force: true });
  cy.get(MITRE_ATTACK_SUBTECHNIQUE_DROPDOWN).first().click({ force: true });
  cy.contains(MITRE_TACTIC, subtechnique.name).click();
  return subtechnique;
};

export const fillFalsePositiveExamples = (falsePositives: string[] = ruleFields.falsePositives) => {
  falsePositives.forEach((falsePositive, index) => {
    cy.get(FALSE_POSITIVES_INPUT).eq(index).clear({ force: true });
    cy.get(FALSE_POSITIVES_INPUT).eq(index).type(falsePositive, { force: true });
    cy.get(ADD_FALSE_POSITIVE_BTN).click({ force: true });
  });
  return falsePositives;
};

export const importSavedQuery = (timelineId: string) => {
  cy.get(IMPORT_QUERY_FROM_SAVED_TIMELINE_LINK).click();
  cy.get(TIMELINE(timelineId)).click();
  cy.get(CUSTOM_QUERY_INPUT).should('not.be.empty');
  removeAlertsIndex();
};

export const fillRelatedIntegrations = (): void => {
  addFirstIntegration();
  addFirstIntegration();
};

const addFirstIntegration = (): void => {
  cy.get('button').contains('Add integration').click();
  cy.get(RELATED_INTEGRATION_COMBO_BOX_INPUT).last().should('be.enabled').click();
  cy.get(COMBO_BOX_OPTION).first().click();
};

export const fillRuleName = (ruleName: string = ruleFields.ruleName) => {
  cy.get(RULE_NAME_INPUT).clear({ force: true });
  cy.get(RULE_NAME_INPUT).type(ruleName, { force: true });
  return ruleName;
};

export const fillCustomQueryInput = (ruleQuery: string = ruleFields.ruleQuery) => {
  getCustomQueryInput().type(ruleQuery);
};

export const fillDescription = (description: string = ruleFields.ruleDescription) => {
  cy.get(RULE_DESCRIPTION_INPUT).clear({ force: true });
  cy.get(RULE_DESCRIPTION_INPUT).type(description, { force: true });

  return description;
};

export const fillSeverity = (severity: string = ruleFields.ruleSeverity) => {
  cy.get(SEVERITY_DROPDOWN).click({ force: true });
  cy.get(`#${severity.toLowerCase()}`).click();
  return severity;
};

export const fillRiskScore = (riskScore: number = ruleFields.riskScore) => {
  cy.get(DEFAULT_RISK_SCORE_INPUT).type(`{selectall}${riskScore}`, { force: true });
  return riskScore;
};

export const fillRuleTags = (tags: string[] = ruleFields.ruleTags) => {
  tags.forEach((tag) => {
    cy.get(TAGS_INPUT).type(`${tag}{enter}`, { force: true });
  });
  return tags;
};

export const fillReferenceUrls = (referenceUrls: string[] = ruleFields.referenceUrls) => {
  referenceUrls.forEach((url, index) => {
    cy.get(REFERENCE_URLS_INPUT).eq(index).clear({ force: true });
    cy.get(REFERENCE_URLS_INPUT).eq(index).type(url, { force: true });

    cy.get(ADD_REFERENCE_URL_BTN).click({ force: true });
  });
  return referenceUrls;
};

export const fillCustomInvestigationFields = (
  fields: string[] = ruleFields.investigationFields.field_names
) => {
  fields.forEach((field) => {
    cy.get(INVESTIGATIONS_INPUT).type(`${field}{enter}`, { force: true });
  });
  return fields;
};

export const fillAboutRuleMinimumAndContinue = (rule: RuleCreateProps) => {
  cy.get(RULE_NAME_INPUT).clear();
  cy.get(RULE_NAME_INPUT).type(rule.name);
  cy.get(RULE_DESCRIPTION_INPUT).clear();
  cy.get(RULE_DESCRIPTION_INPUT).type(rule.description);
  getAboutContinueButton().should('exist').click();
};

export const fillAboutRuleAndContinue = (rule: RuleCreateProps) => {
  fillAboutRule(rule);
  getAboutContinueButton().should('exist').click({ force: true });
};

export const fillAboutRuleWithOverrideAndContinue = (rule: RuleCreateProps) => {
  cy.get(RULE_NAME_INPUT).type(rule.name, { force: true });
  cy.get(RULE_DESCRIPTION_INPUT).type(rule.description, { force: true });

  cy.get(SEVERITY_MAPPING_OVERRIDE_OPTION).click();
  if (rule.severity_mapping) {
    rule.severity_mapping.forEach((severity, i) => {
      cy.get(SEVERITY_OVERRIDE_ROW)
        .eq(i)
        .within(() => {
          cy.get(COMBO_BOX_INPUT).eq(0).type(`${severity.field}{enter}`);
          cy.get(COMBO_BOX_INPUT).eq(1).type(`${severity.value}{enter}`);
        });
    });
  }

  if (rule.severity) {
    fillSeverity(rule.severity);
  }

  cy.get(RISK_MAPPING_OVERRIDE_OPTION).click();
  if (rule.risk_score_mapping) {
    const field = rule.risk_score_mapping[0].field;
    cy.get(RISK_OVERRIDE).within(() => {
      cy.get(COMBO_BOX_INPUT).type(`${field}{enter}`);
    });
  }

  cy.get(DEFAULT_RISK_SCORE_INPUT).type(`{selectall}${rule.risk_score}`, { force: true });

  if (rule.tags) {
    fillRuleTags(rule.tags);
  }

  cy.get(ADVANCED_SETTINGS_BTN).click({ force: true });

  if (rule.references) {
    fillReferenceUrls(rule.references);
  }
  if (rule.false_positives) {
    fillFalsePositiveExamples(rule.false_positives);
  }
  if (rule.threat) {
    fillMitre(rule.threat);
  }
  if (rule.note) {
    fillNote(rule.note);
  }

  cy.get(RULE_NAME_OVERRIDE).within(() => {
    cy.get(COMBO_BOX_INPUT).type(`${rule.rule_name_override}{enter}`);
  });

  cy.get(RULE_TIMESTAMP_OVERRIDE).within(() => {
    cy.get(COMBO_BOX_INPUT).type(`${rule.timestamp_override}{enter}`);
  });

  getAboutContinueButton().should('exist').click({ force: true });
};

export const fillOverrideEsqlRuleName = (value: string) => {
  cy.get(RULE_NAME_OVERRIDE_FOR_ESQL).within(() => {
    cy.get(COMBO_BOX_INPUT).type(`${value}{enter}`);
  });
};

// called after import rule from saved timeline
// if alerts index is created, it is included in the timeline
// to be consistent in multiple test runs, remove it if it's there
export const removeAlertsIndex = () => {
  cy.get(RULE_INDICES).then(($body) => {
    if ($body.find(ALERTS_INDEX_BUTTON).length > 0) {
      cy.get(ALERTS_INDEX_BUTTON).click();
    }
  });
};

export const fillDefineCustomRule = (rule: QueryRuleCreateProps) => {
  if (rule.data_view_id !== undefined) {
    cy.get(DATA_VIEW_OPTION).click();
    fillComboBox({ parentSelector: DATA_VIEW_COMBO_BOX, options: rule.data_view_id });
  }
  cy.get(CUSTOM_QUERY_INPUT)
    .first()
    .should('not.be.disabled')
    .type(rule.query || '', { force: true });
};

export const fillDefineCustomRuleAndContinue = (rule: QueryRuleCreateProps) => {
  fillDefineCustomRule(rule);
  cy.get(DEFINE_CONTINUE_BUTTON).should('exist').click({ force: true });
};

export const fillScheduleRuleAndContinue = (rule: RuleCreateProps) => {
  if (rule.interval) {
    const intervalNumber = rule.interval.slice(0, rule.interval.length - 1);
    const intervalType = rule.interval.charAt(rule.interval.length - 1);
    cy.get(RUNS_EVERY_INTERVAL).type('{selectall}');
    cy.get(RUNS_EVERY_INTERVAL).type(intervalNumber);

    cy.get(RUNS_EVERY_TIME_TYPE).select(intervalType);
  }
  if (rule.from) {
    const additionalLookback = getHumanizedDuration(rule.from, rule.interval ?? '5m');
    const additionalLookbackNumber = additionalLookback.slice(0, additionalLookback.length - 1);
    const additionalLookbackType = additionalLookback.charAt(additionalLookback.length - 1);
    cy.get(LOOK_BACK_INTERVAL).type('{selectAll}');
    cy.get(LOOK_BACK_INTERVAL).type(additionalLookbackNumber);

    cy.get(LOOK_BACK_TIME_TYPE).select(additionalLookbackType);
  }
  cy.get(SCHEDULE_CONTINUE_BUTTON).click({ force: true });
};

export const fillRequiredFields = (): void => {
  addRequiredField();
  addRequiredField();
};

const addRequiredField = (): void => {
  cy.contains('button', 'Add required field').should('be.enabled').click();

  cy.get(REQUIRED_FIELD_COMBO_BOX_INPUT).last().should('be.enabled').click();
  cy.get(COMBO_BOX_OPTION).first().click();
};

/**
 * use default schedule options
 */
export const skipScheduleRuleAction = () => {
  cy.get(SCHEDULE_CONTINUE_BUTTON).click();
};

export const fillFrom = (from: RuleIntervalFrom = ruleFields.ruleIntervalFrom) => {
  const value = from.slice(0, from.length - 1);
  const type = from.slice(from.length - 1);
  cy.get(LOOK_BACK_INTERVAL).type('{selectAll}');
  cy.get(LOOK_BACK_INTERVAL).type(value);

  cy.get(LOOK_BACK_TIME_TYPE).select(type);
};

export const fillRuleAction = (actions: Actions) => {
  actions.connectors.forEach((connector) => {
    switch (connector.type) {
      case 'index':
        cy.get(INDEX_SELECTOR).click();
        cy.get(CREATE_ACTION_CONNECTOR_BTN).click();
        fillIndexConnectorForm(connector);
        break;
      case 'email':
        cy.get(EMAIL_ACTION_BTN).click();
        cy.get(CREATE_ACTION_CONNECTOR_BTN).click();
        fillEmailConnectorForm(connector);
        break;
    }
  });
};

export const createCasesAction = () => {
  cy.get(CASES_SYSTEM_ACTION_BTN).click();
};

export const fillRuleActionFilters = (alertsFilter: AlertsFilter) => {
  cy.get(ACTIONS_ALERTS_QUERY_FILTER_BUTTON).click();
  cy.get(ACTIONS_ALERTS_QUERY_FILTER_INPUT()).type(alertsFilter.query.kql);

  cy.get(ACTIONS_ALERTS_TIMEFRAME_FILTER_BUTTON).click();
  alertsFilter.timeframe.days.forEach((day) =>
    cy.get(ACTIONS_ALERTS_TIMEFRAME_WEEKDAY_BUTTON(day)).click()
  );
  cy.get(ACTIONS_ALERTS_TIMEFRAME_START_INPUT)
    .first()
    .type(`{selectall}${alertsFilter.timeframe.hours.start}{enter}`);
  cy.get(ACTIONS_ALERTS_TIMEFRAME_END_INPUT)
    .first()
    .type(`{selectall}${alertsFilter.timeframe.hours.end}{enter}`);
  cy.get(ACTIONS_ALERTS_TIMEFRAME_TIMEZONE_INPUT)
    .first()
    .type(`{selectall}${alertsFilter.timeframe.timezone}{enter}`);
};

export const fillDefineThresholdRule = (rule: ThresholdRuleCreateProps) => {
  const thresholdField = 0;
  const threshold = 1;

  cy.get(CUSTOM_QUERY_INPUT)
    .first()
    .should('not.be.disabled')
    .type(rule.query || '', { force: true });
  cy.get(THRESHOLD_INPUT_AREA)
    .find(INPUT)
    .then((inputs) => {
      cy.wrap(inputs[thresholdField]).click();
      cy.wrap(inputs[thresholdField]).type(
        isArray(rule.threshold.field) ? rule.threshold.field[0] : rule.threshold.field,
        {
          delay: 35,
        }
      );
      cy.get(EUI_FILTER_SELECT_ITEM).click({ force: true });
      cy.wrap(inputs[threshold]).clear();
      cy.wrap(inputs[threshold]).type(`${rule.threshold.value}`);
    });
};

export const fillDefineThresholdRuleAndContinue = (rule: ThresholdRuleCreateProps) => {
  fillDefineThresholdRule(rule);
  continueFromDefineStep();
};

export const fillDefineEqlRule = (rule: EqlRuleCreateProps) => {
  cy.get(RULES_CREATION_FORM).find(EQL_QUERY_INPUT).should('exist');
  cy.get(RULES_CREATION_FORM).find(EQL_QUERY_INPUT).scrollIntoView();
  cy.get(RULES_CREATION_FORM).find(EQL_QUERY_INPUT).should('be.visible');
  cy.get(RULES_CREATION_FORM).find(EQL_QUERY_INPUT).type(rule.query);
  cy.get(RULES_CREATION_FORM).find(EQL_QUERY_VALIDATION_SPINNER).should('not.exist');
  cy.get(RULES_CREATION_PREVIEW_BUTTON).should('not.be.disabled').click({ force: true });
  cy.get(RULES_CREATION_PREVIEW_REFRESH_BUTTON).should('not.be.disabled').click({ force: true });
  cy.get(PREVIEW_HISTOGRAM)
    .invoke('text')
    .then((text) => {
      if (text !== 'Rule Preview') {
        cy.get(RULES_CREATION_PREVIEW_REFRESH_BUTTON).click({ force: true });
        cy.get(PREVIEW_HISTOGRAM).should('contain.text', 'Rule Preview');
      }
    });
  cy.get(TOAST_ERROR).should('not.exist');
};

export const fillDefineEqlRuleAndContinue = (rule: EqlRuleCreateProps) => {
  fillDefineEqlRule(rule);
  cy.get(DEFINE_CONTINUE_BUTTON).should('exist').click({ force: true });
};

export const fillDefineNewTermsRule = (rule: NewTermsRuleCreateProps) => {
  cy.get(CUSTOM_QUERY_INPUT)
    .first()
    .should('not.be.disabled')
    .type(rule.query || '', { force: true });
  cy.get(NEW_TERMS_INPUT_AREA).find(INPUT).click();
  cy.get(NEW_TERMS_INPUT_AREA).find(INPUT).type(`${rule.new_terms_fields[0]}{enter}`);

  cy.focused().type('{esc}'); // Close combobox dropdown so next inputs can be interacted with
  const historySize = convertHistoryStartToSize(rule.history_window_start);
  const historySizeNumber = historySize.slice(0, historySize.length - 1);
  const historySizeType = historySize.charAt(historySize.length - 1);
  cy.get(NEW_TERMS_INPUT_AREA).find(NEW_TERMS_HISTORY_SIZE).type('{selectAll}');
  cy.get(NEW_TERMS_INPUT_AREA).find(NEW_TERMS_HISTORY_SIZE).type(historySizeNumber);
  cy.get(NEW_TERMS_INPUT_AREA).find(NEW_TERMS_HISTORY_TIME_TYPE).select(historySizeType);
};

export const fillDefineNewTermsRuleAndContinue = (rule: NewTermsRuleCreateProps) => {
  fillDefineNewTermsRule(rule);
  cy.get(DEFINE_CONTINUE_BUTTON).should('exist').click({ force: true });
};

/**
 * Pastes query into the ES|QL Monaco editor via a synthetic ClipboardEvent.
 * This avoids flakiness in the tests when typing in the ES|QL query bar.
 */
export const fillEsqlQueryBar = (query: string) => {
  cy.get(ESQL_QUERY_BAR_INPUT_AREA).should('exist').click({ force: true });

  const selectAll = Cypress.platform === 'darwin' ? '{cmd}a' : '{ctrl}a';
  cy.get(ESQL_QUERY_BAR_INPUT_AREA).type(`${selectAll}{del}`, { force: true });

  cy.get(ESQL_QUERY_BAR_INPUT_AREA).then(($textarea) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', query);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    $textarea[0].dispatchEvent(pasteEvent);
  });

  cy.get(ESQL_QUERY_BAR).contains(query);
};

export const fillDefineEsqlRuleAndContinue = (rule: EsqlRuleCreateProps) => {
  cy.get(ESQL_QUERY_BAR).contains('ES|QL query');
  fillEsqlQueryBar(rule.query);

  cy.get(DEFINE_CONTINUE_BUTTON).should('exist').click();
};

/**
 * fills only required(name, description) and specific to ES|QL(rule name override) fields on about page
 */
export const fillAboutSpecificEsqlRuleAndContinue = (rule: EsqlRuleCreateProps) => {
  fillRuleName(rule.name);
  fillDescription(rule.description);

  expandAdvancedSettings();
  // this field defined to be returned in rule query
  fillOverrideEsqlRuleName(rule.rule_name_override ?? '');
  getAboutContinueButton().click();
};

/**
 * Fills in the indicator match rows for tests by giving it an optional rowNumber,
 * a indexField, a indicatorIndexField, and an optional validRows which indicates
 * which row is valid or not.
 *
 * There are special tricks below with Eui combo box:
 * cy.get(`.euiComboBoxOption[title="${indexField}"]`)
 * .should('be.visible')
 * .then(([e]) => e.click());
 *
 * To first ensure the button is there before clicking on the button. There are
 * race conditions where if the Eui drop down button from the combo box is not
 * visible then the click handler is not there either, and when we click on it
 * that will cause the item to _not_ be selected. Using a {enter} with the combo
 * box also does not select things from EuiCombo boxes either, so I have to click
 * the actual contents of the EuiCombo box to select things.
 */
export const fillIndicatorMatchRow = ({
  rowNumber,
  indexField,
  indicatorIndexField,
  validColumns,
  doesNotMatch,
}: {
  rowNumber?: number; // default is 1
  indexField: string;
  indicatorIndexField: string;
  validColumns?: 'indexField' | 'indicatorField' | 'both' | 'none'; // default is both are valid entries
  doesNotMatch?: boolean;
}) => {
  const computedRowNumber = rowNumber == null ? 1 : rowNumber;
  const computedValueRows = validColumns == null ? 'both' : validColumns;
  cy.get(THREAT_MAPPING_COMBO_BOX_INPUT)
    .eq(computedRowNumber * 2 - 2)
    .eq(0)
    .type(indexField);
  if (computedValueRows === 'indexField' || computedValueRows === 'both') {
    cy.get(`[data-test-subj="filterFieldOption-${indexField}"]`).click();
  }
  cy.get(THREAT_MAPPING_COMBO_BOX_INPUT)
    .eq(computedRowNumber * 2 - 1)
    .type(indicatorIndexField);

  if (computedValueRows === 'indicatorField' || computedValueRows === 'both') {
    cy.get(`[data-test-subj="filterFieldOption-${indicatorIndexField}"]`).click();
  }

  if (doesNotMatch) {
    selectDoesNotMatchOperator(computedRowNumber - 1);
  }
};

/**
 * Fills in both the index pattern and the indicator match index pattern.
 * @param indexPattern  The index pattern.
 * @param indicatorIndex The indicator index pattern.
 */
export const fillIndexAndIndicatorIndexPattern = (
  indexPattern?: string[],
  indicatorIndex?: string[]
) => {
  getIndexPatternClearButton().click();

  getRuleIndexInput().type(`${indexPattern}{enter}`);
  getIndicatorIndicatorIndex().type(`{backspace}{enter}${indicatorIndex}{enter}`);
};

/** Returns the indicator index drop down field. Pass in row number, default is 1 */
export const getIndicatorIndexComboField = (row = 1) =>
  cy.get(THREAT_COMBO_BOX_INPUT).eq(row * 2 - 2);

/** Returns the indicator mapping drop down field. Pass in row number, default is 1 */
export const getIndicatorMappingComboField = (row = 1) =>
  cy.get(THREAT_COMBO_BOX_INPUT).eq(row * 2 - 1);

/** Returns the indicator matches DELETE button for the mapping. Pass in row number, default is 1  */
export const getIndicatorDeleteButton = (row = 1) =>
  cy.get(THREAT_ITEM_ENTRY_DELETE_BUTTON).eq(row - 1);

/** Returns the indicator matches AND button for the mapping */
export const getIndicatorAndButton = () => cy.get(THREAT_MATCH_AND_BUTTON);

/** Returns the indicator matches OR button for the mapping */
export const getIndicatorOrButton = () => cy.get(THREAT_MATCH_OR_BUTTON);

/** Returns the invalid match content. */
export const getIndicatorInvalidationText = () => cy.contains(INVALID_MATCH_CONTENT);

/** Returns that at least one valid match is required content */
export const getIndicatorAtLeastOneInvalidationText = () => cy.contains(AT_LEAST_ONE_VALID_MATCH);

/** Returns that at least one index pattern is required content */
export const getIndexPatternInvalidationText = () => cy.contains(AT_LEAST_ONE_INDEX_PATTERN);

/** Returns the continue button on the step of about */
export const getAboutContinueButton = () => cy.get(ABOUT_CONTINUE_BTN);

/** Returns the continue button on the step of define */
export const getDefineContinueButton = () => cy.get(DEFINE_CONTINUE_BUTTON);

/** Returns the custom rule index pattern input */
export const getRuleIndexInput = () => {
  return cy.get(CUSTOM_INDEX_PATTERN_INPUT).eq(0);
};

/** Returns the indicator's indicator index */
export const getIndicatorIndicatorIndex = () =>
  cy.get(THREAT_MATCH_INDICATOR_INDICATOR_INDEX).eq(0);

/** Returns the index pattern's clear button  */
export const getIndexPatternClearButton = () => cy.get(COMBO_BOX_CLEAR_BTN).first();

/** Returns the custom query input */
export const getCustomQueryInput = () => cy.get(THREAT_MATCH_CUSTOM_QUERY_INPUT).eq(0);

/** Returns the custom query input */
export const getCustomIndicatorQueryInput = () => cy.get(THREAT_MATCH_QUERY_INPUT).eq(0);

/** Returns custom query required content */
export const getCustomQueryInvalidationText = () => cy.contains(CUSTOM_QUERY_REQUIRED);

/** Returns threat match query required content */
export const getThreatMatchQueryInvalidationText = () => cy.contains(THREAT_MATCH_QUERY_REQUIRED);

/**
 * Fills in the define indicator match rules and then presses the continue button
 * @param rule The rule to use to fill in everything
 */
export const fillDefineIndicatorMatchRuleAndContinue = (rule: ThreatMatchRuleCreateProps) => {
  fillDefineIndicatorMatchRule(rule);
  continueFromDefineStep();
};

export const fillDefineIndicatorMatchRule = (rule: ThreatMatchRuleCreateProps) => {
  if (rule.index) {
    fillIndexAndIndicatorIndexPattern(rule.index, rule.threat_index);
  }
  fillIndicatorMatchRow({
    indexField: rule.threat_mapping[0].entries[0].field,
    indicatorIndexField: rule.threat_mapping[0].entries[0].value,
  });
  getCustomIndicatorQueryInput().type('{selectall}{enter}*:*');
};

/**
 * presses continue on form Define step
 */
export const continueFromDefineStep = () => {
  getDefineContinueButton().should('exist').click({ force: true });
};

const optionsToComboboxText = (options: string[]) => {
  return options.map((o) => `${o}{downArrow}{enter}{esc}`).join('');
};

export const fillDefineMachineLearningRule = (rule: MachineLearningRuleCreateProps) => {
  const jobsAsArray = isArray(rule.machine_learning_job_id)
    ? rule.machine_learning_job_id
    : [rule.machine_learning_job_id];
  cy.get(MACHINE_LEARNING_DROPDOWN_INPUT).click({ force: true });
  cy.get(COMBO_BOX_OPTION).should('have.length.gte', 1);
  cy.get(MACHINE_LEARNING_DROPDOWN_INPUT).type(optionsToComboboxText(jobsAsArray));
  cy.get(ANOMALY_THRESHOLD_INPUT).type(`{selectall}${rule.anomaly_threshold}`, {
    force: true,
  });
};

export const fillDefineMachineLearningRuleAndContinue = (rule: MachineLearningRuleCreateProps) => {
  fillDefineMachineLearningRule(rule);
  getDefineContinueButton().should('exist').click({ force: true });
};

export const goToAboutStepTab = () => {
  cy.get(ABOUT_EDIT_TAB).click({ force: true });
};

export const goToScheduleStepTab = () => {
  cy.get(SCHEDULE_EDIT_TAB).click({ force: true });
};

export const goToActionsStepTab = () => {
  cy.get(ACTIONS_EDIT_TAB).click({ force: true });
};

export const selectEqlRuleType = () => {
  cy.get(EQL_TYPE).click({ force: true });
};

export const selectIndicatorMatchType = () => {
  cy.get(INDICATOR_MATCH_TYPE).click({ force: true });
};

export const selectMachineLearningRuleType = () => {
  cy.get(MACHINE_LEARNING_TYPE).contains('Select');
  cy.get(MACHINE_LEARNING_TYPE).click({ force: true });
};

export const selectThresholdRuleType = () => {
  cy.get(THRESHOLD_TYPE).click({ force: true });
};

export const selectNewTermsRuleType = () => {
  cy.get(NEW_TERMS_TYPE).click({ force: true });
};

export const selectEsqlRuleType = () => {
  cy.get(ESQL_TYPE).click();
};

export const waitForAlertsToPopulate = (alertCountThreshold = 1) => {
  cy.waitUntil(
    () => {
      cy.log('Waiting for alerts to appear');
      refreshPage();
      cy.waitForNetworkIdle('/internal/search/privateRuleRegistryAlertsSearchStrategy', 500);
      cy.get([EMPTY_ALERT_TABLE, ALERTS_TABLE_COUNT].join(', '));
      return cy.root().then(($el) => {
        const emptyTableState = $el.find(EMPTY_ALERT_TABLE);
        if (emptyTableState.length > 0) {
          cy.log('Table is empty', emptyTableState.length);
          return false;
        }
        const countEl = $el.find(ALERTS_TABLE_COUNT);
        const alertCount = parseInt(countEl.text(), 10) || 0;
        return alertCount >= alertCountThreshold;
      });
    },
    { interval: 500, timeout: 30000 }
  );
  waitForAlerts();
};

export const selectAndLoadSavedQuery = (queryName: string, queryValue: string) => {
  cy.get(QUERY_BAR).find(SHOW_QUERY_BAR_BUTTON).click();

  cy.get(LOAD_SAVED_QUERIES_LIST_BUTTON).click();
  cy.get(savedQueryByName(queryName)).click();
  cy.get(APPLY_SELECTED_SAVED_QUERY_BUTTON).click();

  cy.get(CUSTOM_QUERY_INPUT).should('have.value', queryValue);
};

export const enablesAndPopulatesThresholdSuppression = (
  interval: number,
  timeUnit: 's' | 'm' | 'h'
) => {
  // enable suppression is unchecked so the rest of suppression components are disabled
  cy.get(ALERT_SUPPRESSION_DURATION_PER_TIME_INTERVAL).should('be.disabled').should('be.checked');
  cy.get(ALERT_SUPPRESSION_DURATION_PER_RULE_EXECUTION)
    .should('be.disabled')
    .should('not.be.checked');

  // enables suppression for threshold rule
  cy.get(THRESHOLD_ENABLE_SUPPRESSION_CHECKBOX).should('not.be.checked');
  cy.get(THRESHOLD_ENABLE_SUPPRESSION_CHECKBOX).click();
  cy.get(THRESHOLD_ENABLE_SUPPRESSION_CHECKBOX).should('be.checked');

  setAlertSuppressionDuration(interval, timeUnit);

  // rule execution radio option is disabled, per time interval becomes enabled when suppression enabled
  cy.get(ALERT_SUPPRESSION_DURATION_PER_RULE_EXECUTION).should('be.disabled');
  cy.get(ALERT_SUPPRESSION_DURATION_PER_TIME_INTERVAL).should('be.enabled').should('be.checked');
};

/**
 * @param fields - The fields to fill in the alert suppression combo box.
 * @param checkFieldsInComboBox - Whether to check if the fields are in the combo box before filling. It can be useful if takes time to load all options from index.
 * If there are many fields in combobox, they are might be visible only after scrolling down menu.
 */
export const fillAlertSuppressionFields = (fields: string[], checkFieldsInComboBox?: boolean) => {
  cy.get(ALERT_SUPPRESSION_FIELDS_COMBO_BOX).should('not.be.disabled');
  cy.get(ALERT_SUPPRESSION_FIELDS_COMBO_BOX).click();
  fields.forEach((field) => {
    if (checkFieldsInComboBox) {
      cy.get(COMBO_BOX_OPTION).should('contain.text', field);
    }

    cy.get(ALERT_SUPPRESSION_FIELDS_COMBO_BOX).type(field);
    // Using a click instead of keyboard navigation to avoid potential focus loss when page is still loading
    cy.contains(COMBO_BOX_OPTION, field).click();
    // Wait for the field to be selected as a pill before closing the dropdown,
    // otherwise {esc} can race with {enter} and cancel the selection
    cy.get(ALERT_SUPPRESSION_FIELDS_COMBO_BOX)
      .find('[data-test-subj="euiComboBoxPill"]')
      .should('contain.text', field);
  });
  cy.get(ALERT_SUPPRESSION_FIELDS_COMBO_BOX).type('{esc}');
};

export const clearAlertSuppressionFields = () => {
  cy.get(ALERT_SUPPRESSION_FIELDS_COMBO_BOX).should('not.be.disabled');
  cy.get(ALERT_SUPPRESSION_FIELDS).within(() => {
    cy.get(COMBO_BOX_CLEAR_BTN).click();
  });
};

export const selectAlertSuppressionPerInterval = () => {
  cy.get(ALERT_SUPPRESSION_DURATION_PER_TIME_INTERVAL).should('be.enabled');
  // checkbox is covered by label, force:true is a workaround
  // click on label not working, likely because it has child components
  cy.get(ALERT_SUPPRESSION_DURATION_PER_TIME_INTERVAL).click({ force: true });
};

export const selectAlertSuppressionPerRuleExecution = () => {
  cy.get(ALERT_SUPPRESSION_DURATION_PER_RULE_EXECUTION).should('be.enabled');
  cy.get(ALERT_SUPPRESSION_DURATION_PER_RULE_EXECUTION).click();
};

export const selectDoNotSuppressForMissingFields = () => {
  cy.get(ALERT_SUPPRESSION_MISSING_FIELDS_DO_NOT_SUPPRESS).click();
};

export const setAlertSuppressionDuration = (interval: number, timeUnit: 's' | 'm' | 'h') => {
  cy.get(ALERT_SUPPRESSION_DURATION_VALUE_INPUT).should('be.enabled');
  cy.get(ALERT_SUPPRESSION_DURATION_VALUE_INPUT).type(`{selectall}${interval}`);

  cy.get(ALERT_SUPPRESSION_DURATION_UNIT_INPUT).should('be.enabled');
  cy.get(ALERT_SUPPRESSION_DURATION_UNIT_INPUT).select(timeUnit);
};

/**
 * Opens tooltip on disabled suppression fields and checks if it contains requirement for Platinum license.
 *
 * Suppression fields are disabled when app has insufficient license
 */
export const openSuppressionFieldsTooltipAndCheckLicense = () => {
  cy.get(ALERT_SUPPRESSION_FIELDS_INPUT).should('be.disabled');
  cy.get(ALERT_SUPPRESSION_FIELDS).trigger('mouseover');
  // Platinum license is required, tooltip on disabled alert suppression checkbox should tell this
  cy.get(TOOLTIP).contains('Platinum license');
};

/**
 * intercepts esql_async request that contains esqlQuery and adds alias to it
 */
export const interceptEsqlQueryFieldsRequest = (
  esqlQuery: string,
  alias: string = 'esqlQueryFields'
) => {
  cy.intercept('POST', '/internal/search/esql_async', (req) => {
    if (req.body?.params?.query?.includes?.(esqlQuery)) {
      req.alias = alias;
    }
  });
};

export const selectDoesNotMatchOperator = (rowNumber: number = 0) => {
  cy.get(THREAT_MATCH_OPERATOR_SELECT).eq(rowNumber).click();
  cy.get('[role=option]#DOES_NOT_MATCH').click();
};

export const checkLoadQueryDynamically = () => {
  cy.get(LOAD_QUERY_DYNAMICALLY_CHECKBOX).click({ force: true });
  cy.get(LOAD_QUERY_DYNAMICALLY_CHECKBOX).should('be.checked');
};

export const uncheckLoadQueryDynamically = () => {
  cy.get(LOAD_QUERY_DYNAMICALLY_CHECKBOX).click({ force: true });
  cy.get(LOAD_QUERY_DYNAMICALLY_CHECKBOX).should('not.be.checked');
};

export const openAddFilterPopover = () => {
  cy.get(QUERY_BAR_ADD_FILTER).click();
};

export const checkEnableLoggedRequests = () => {
  cy.get(PREVIEW_LOGGED_REQUESTS_CHECKBOX).click();
  cy.get(PREVIEW_LOGGED_REQUESTS_CHECKBOX).should('be.checked');
};

export const submitRulePreview = () => {
  cy.get(RULES_CREATION_PREVIEW_REFRESH_BUTTON).click();
};

export const toggleLoggedRequestsPageAccordion = () => {
  cy.get(PREVIEW_LOGGED_REQUESTS_PAGE_ACCORDION_BUTTON).first().click();
};

export const toggleLoggedRequestsAccordion = () => {
  cy.get(PREVIEW_LOGGED_REQUESTS_ACCORDION_BUTTON).first().click();
};

export const toggleLoggedRequestsItemAccordion = () => {
  cy.get(PREVIEW_LOGGED_REQUESTS_ITEM_ACCORDION_BUTTON).should('be.visible').first().click();
};
