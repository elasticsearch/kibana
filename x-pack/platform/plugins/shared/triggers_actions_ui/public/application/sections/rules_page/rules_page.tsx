/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { useHistory, useLocation } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';
import {
  getCreateRuleRoute,
  getEditRuleRoute,
  getRulesAppDetailsRoute,
  rulesAppDetailsRoute,
  getCreateRuleFromTemplateRoute,
} from '@kbn/rule-data-utils';
import { useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared';
import { RuleTypeModal } from '@kbn/response-ops-rule-form';
import { AppHeader, type AppHeaderTab } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import { EuiSpacer } from '@elastic/eui';
import { useKibana } from '../../../common/lib/kibana';
import { getAlertingSectionBreadcrumb, getRulesBreadcrumbWithHref } from '../../lib/breadcrumb';
import { getCurrentDocTitle } from '../../lib/doc_title';
import type { Section } from '../../constants';
import { suspendedComponentWithProps } from '../../lib/suspended_component_with_props';
import { RulesSettingsFlyout } from '../../components/rules_setting/rules_settings_flyout';

const LogsList = lazy(() => import('../rule_details/components/global_rule_event_log_list'));
const RulesList = lazy(() => import('../rules_list/components/rules_list'));

const RulesPage = () => {
  const history = useHistory();
  const location = useLocation();
  const {
    chrome: { docTitle },
    application: {
      getUrlForApp,
      isAppRegistered,
      capabilities: { rulesSettings = {} },
    },
    http,
    notifications: { toasts },
    ruleTypeRegistry,
    cps,
    docLinks,
    setBreadcrumbs,
  } = useKibana().services;

  const { authorizedToReadAnyRules, authorizedToCreateAnyRules } = useGetRuleTypesPermissions({
    http,
    toasts,
    filteredRuleTypes: [],
  });

  const [ruleTypeModalVisible, setRuleTypeModalVisibility] = useState<boolean>(false);
  const [isSettingsFlyoutVisible, setIsSettingsFlyoutVisible] = useState<boolean>(false);

  const currentSection: Section = location.pathname.endsWith('/logs') ? 'logs' : 'rules';
  const backButtonHref = getUrlForApp('observability-overview', { path: '/alerts' });

  const { show, readFlappingSettingsUI, readQueryDelaySettingsUI } = rulesSettings;
  const canShowSettings = show && (readFlappingSettingsUI || readQueryDelaySettingsUI);

  const openRuleTypeModal = useCallback(() => {
    setRuleTypeModalVisibility(true);
  }, []);

  const tabs: AppHeaderTab[] = useMemo(() => {
    const result: AppHeaderTab[] = [
      {
        id: 'rules',
        label: i18n.translate('xpack.triggersActionsUI.home.rulesTabTitle', {
          defaultMessage: 'Rules',
        }),
        isSelected: currentSection === 'rules',
        onClick: () => history.push('/'),
        'data-test-subj': 'rulesTab',
      },
    ];
    if (authorizedToReadAnyRules) {
      result.push({
        id: 'logs',
        label: i18n.translate('xpack.triggersActionsUI.home.logsTabTitle', {
          defaultMessage: 'Logs',
        }),
        isSelected: currentSection === 'logs',
        onClick: () => history.push('/logs'),
        'data-test-subj': 'logsTab',
      });
    }
    return result;
  }, [currentSection, authorizedToReadAnyRules, history]);

  const appMenu = useMemo<AppMenuConfig>(
    () => ({
      primaryActionItem: authorizedToCreateAnyRules
        ? {
            id: 'createRule',
            label: i18n.translate('xpack.triggersActionsUI.rules.addRuleButtonLabel', {
              defaultMessage: 'Create rule',
            }),
            iconType: 'plusCircle',
            run: openRuleTypeModal,
            testId: 'createRuleButton',
          }
        : undefined,
      items: [
        ...(canShowSettings
          ? [
              {
                id: 'rulesSettings',
                order: 100,
                label: i18n.translate('xpack.triggersActionsUI.rulesSettings.link.title', {
                  defaultMessage: 'Settings',
                }),
                iconType: 'gear',
                run: () => setIsSettingsFlyoutVisible(true),
                testId: 'rulesSettingsLink',
              },
            ]
          : []),
      ],
    }),
    [authorizedToCreateAnyRules, canShowSettings, openRuleTypeModal]
  );

  // Use ref to store latest location to avoid recreating callbacks when search/hash changes
  // Updating ref.current doesn't cause re-renders, so we can do it directly in render
  const locationRef = useRef(location);
  locationRef.current = location;

  const navigateToRuleForm = useCallback(
    (destinationPathname: string) => {
      const { pathname, search, hash } = locationRef.current;
      const returnPath = `${pathname}${search}${hash}` || '/';
      history.push({
        pathname: destinationPathname,
        search,
        hash,
        state: { returnPath },
      });
    },
    [history]
  );

  const navigateToEditRuleForm = useCallback(
    (ruleId: string) => navigateToRuleForm(getEditRuleRoute(ruleId)),
    [navigateToRuleForm]
  );

  const navigateToCreateRuleForm = useCallback(
    (ruleTypeId: string) => navigateToRuleForm(getCreateRuleRoute(ruleTypeId)),
    [navigateToRuleForm]
  );

  const navigateToCreateRuleFromTemplateForm = useCallback(
    (templateId: string) => navigateToRuleForm(getCreateRuleFromTemplateRoute(templateId)),
    [navigateToRuleForm]
  );

  const renderRulesList = useCallback(() => {
    return (
      <RulesList
        rulesListKey="rules-page"
        showCreateRuleButtonInPrompt={true}
        navigateToEditRuleForm={navigateToEditRuleForm}
        navigateToCreateRuleForm={navigateToCreateRuleForm}
        ruleDetailsRoute={rulesAppDetailsRoute}
      />
    );
  }, [navigateToEditRuleForm, navigateToCreateRuleForm]);

  const renderLogsList = useCallback(() => {
    return (
      <KibanaPageTemplate.Section grow={false} paddingSize="none">
        <EuiSpacer size="s" />
        {suspendedComponentWithProps(
          LogsList,
          'xl'
        )({
          getRuleDetailsRoute: getRulesAppDetailsRoute,
        })}
      </KibanaPageTemplate.Section>
    );
  }, []);

  useEffect(() => {
    if (setBreadcrumbs) {
      if (currentSection === 'logs') {
        const rulesBreadcrumbWithAppPath = getRulesBreadcrumbWithHref(getUrlForApp);
        setBreadcrumbs([rulesBreadcrumbWithAppPath, getAlertingSectionBreadcrumb('logs')]);
      } else {
        setBreadcrumbs([getAlertingSectionBreadcrumb('rules')]);
      }
    }
    docTitle.change(getCurrentDocTitle('rules'));
  }, [docTitle, setBreadcrumbs, currentSection, getUrlForApp, isAppRegistered]);

  return (
    <>
      <AppHeader
        title={i18n.translate('xpack.triggersActionsUI.rulesPage.pageTitle', {
          defaultMessage: 'Rules',
        })}
        tabs={tabs}
        menu={appMenu}
        docLink={docLinks.links.alerting.guide}
        back={{
          href: backButtonHref,
          label: i18n.translate('xpack.triggersActionsUI.rulesPage.backButtonLabel', {
            defaultMessage: 'Alerts',
          }),
        }}
      />
      <Routes>
        <Route exact path="/logs" component={renderLogsList} />
        <Route exact path="/" component={renderRulesList} />
      </Routes>
      {ruleTypeModalVisible && (
        <RuleTypeModal
          onClose={() => setRuleTypeModalVisibility(false)}
          onSelectRuleType={navigateToCreateRuleForm}
          onSelectTemplate={(templateId) => {
            // For templates, we need to extract the ruleTypeId or handle it differently
            // For now, fall back to default behavior
            navigateToCreateRuleFromTemplateForm(templateId);
          }}
          http={http}
          toasts={toasts}
          registeredRuleTypes={ruleTypeRegistry.list()}
          filteredRuleTypes={[]}
          cps={cps}
        />
      )}
      <RulesSettingsFlyout
        isVisible={isSettingsFlyoutVisible}
        onClose={() => setIsSettingsFlyoutVisible(false)}
        alertDeleteCategoryIds={['management', 'observability', 'securitySolution']}
      />
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export default RulesPage;
