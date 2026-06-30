/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';
import { i18n } from '@kbn/i18n';
import { EuiSpacer } from '@elastic/eui';

import { AppHeader, type AppHeaderTab } from '@kbn/app-header';

import { Section } from '../../../../common/constants';
import { documentationService } from '../../services/documentation';
import { ComponentTemplateList } from '../../components/component_templates';
import { useAppContext } from '../../app_context';
import { IndexList } from './index_list';
import { EnrichPoliciesList } from './enrich_policies_list';
import { IndexDetailsPage } from './index_list/details_page';
import { DataStreamList } from './data_stream_list';
import { TemplateList } from './template_list';

export const homeSections = [
  Section.Indices,
  Section.DataStreams,
  Section.IndexTemplates,
  Section.ComponentTemplates,
  Section.EnrichPolicies,
];

interface MatchParams {
  section: Section;
}

export const IndexManagementHome: React.FunctionComponent<RouteComponentProps<MatchParams>> = ({
  match: {
    params: { section },
  },
  history,
}) => {
  const {
    plugins: { console: consolePlugin },
    privs,
  } = useAppContext();

  const onSectionChange = (newSection: Section) => {
    history.push(`/${newSection}`);
  };

  const tabs: AppHeaderTab[] = [
    {
      id: Section.Indices,
      label: i18n.translate('xpack.idxMgmt.home.indicesTabTitle', { defaultMessage: 'Indices' }),
      isSelected: section === Section.Indices,
      onClick: () => onSectionChange(Section.Indices),
      'data-test-subj': `${Section.Indices}Tab`,
    },
    {
      id: Section.DataStreams,
      label: i18n.translate('xpack.idxMgmt.home.dataStreamsTabTitle', {
        defaultMessage: 'Data Streams',
      }),
      isSelected: section === Section.DataStreams,
      onClick: () => onSectionChange(Section.DataStreams),
      'data-test-subj': `${Section.DataStreams}Tab`,
    },
    {
      id: Section.IndexTemplates,
      label: i18n.translate('xpack.idxMgmt.home.indexTemplatesTabTitle', {
        defaultMessage: 'Index Templates',
      }),
      isSelected: section === Section.IndexTemplates,
      onClick: () => onSectionChange(Section.IndexTemplates),
      'data-test-subj': `${Section.IndexTemplates}Tab`,
    },
    {
      id: Section.ComponentTemplates,
      label: i18n.translate('xpack.idxMgmt.home.componentTemplatesTabTitle', {
        defaultMessage: 'Component Templates',
      }),
      isSelected: section === Section.ComponentTemplates,
      onClick: () => onSectionChange(Section.ComponentTemplates),
      'data-test-subj': `${Section.ComponentTemplates}Tab`,
    },
  ];

  if (privs.monitorEnrich) {
    tabs.push({
      id: Section.EnrichPolicies,
      label: i18n.translate('xpack.idxMgmt.home.enrichPoliciesTabTitle', {
        defaultMessage: 'Enrich Policies',
      }),
      isSelected: section === Section.EnrichPolicies,
      onClick: () => onSectionChange(Section.EnrichPolicies),
      'data-test-subj': `${Section.EnrichPolicies}Tab`,
    });
  }

  const indexManagementTabs = (
    <>
      <AppHeader
        title={i18n.translate('xpack.idxMgmt.home.appTitle', {
          defaultMessage: 'Index Management',
        })}
        tabs={tabs}
        padding={{ bleed: 'l' }}
        docLink={documentationService.getIdxMgmtDocumentationLink()}
      />
      <EuiSpacer size="l" />

      <Routes>
        <Route
          exact
          path={[`/${Section.DataStreams}`, `/${Section.DataStreams}/:dataStreamName?`]}
          component={DataStreamList}
        />
        <Route exact path={`/${Section.Indices}`} component={IndexList} />
        <Route
          exact
          path={[`/${Section.IndexTemplates}`, `/${Section.IndexTemplates}/:templateName?`]}
          component={TemplateList}
        />
        <Route
          exact
          path={[
            `/${Section.ComponentTemplates}`,
            `/${Section.ComponentTemplates}/:componentTemplateName?`,
          ]}
          component={ComponentTemplateList}
        />
        {privs.monitorEnrich && (
          <Route exact path={`/${Section.EnrichPolicies}`} component={EnrichPoliciesList} />
        )}
      </Routes>
      {consolePlugin?.EmbeddableConsole ? <consolePlugin.EmbeddableConsole /> : null}
    </>
  );
  return (
    <Routes>
      <Route path={`/${Section.Indices}/index_details`} component={IndexDetailsPage} />
      <Route render={() => indexManagementTabs} />
    </Routes>
  );
};
