/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, useEffect } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiTitle,
} from '@elastic/eui';
import { Router, Route, Routes } from '@kbn/shared-ux-router';
import type { AppMountParameters, ChromeBreadcrumb } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { useHistory, useLocation } from 'react-router-dom';
import { APP_TITLE } from './translations';
import { ExperimentsListPage } from './pages/experiments_list';
import { DatasetsListPage } from './pages/datasets_list';
import { OnlineEvalsListPage } from './pages/online_evals_list';
import { OnlineEvalDetailPage } from './pages/online_eval_detail';

const ExperimentDetailPage = React.lazy(async () => {
  const mod = await import('./pages/experiment_detail');
  return { default: mod.ExperimentDetailPage };
});

const DatasetDetailPage = React.lazy(async () => {
  const mod = await import('./pages/dataset_detail');
  return { default: mod.DatasetDetailPage };
});

const RemotesListPage = React.lazy(async () => {
  const mod = await import('./pages/remotes_list');
  return { default: mod.RemotesListPage };
});

const TracingProjectsListPage = React.lazy(async () => {
  const mod = await import('./pages/tracing_projects_list');
  return { default: mod.TracingProjectsListPage };
});

const TracingProjectDetailPage = React.lazy(async () => {
  const mod = await import('./pages/tracing_project_detail');
  return { default: mod.TracingProjectDetailPage };
});

const CompareExperimentsPage = React.lazy(async () => {
  const mod = await import('./pages/compare_experiments');
  return { default: mod.CompareExperimentsPage };
});

const RunOverviewPage = React.lazy(async () => {
  const mod = await import('./pages/run_overview');
  return { default: mod.RunOverviewPage };
});

const EvaluatorsPage = React.lazy(async () => {
  const mod = await import('./pages/evaluators');
  return { default: mod.EvaluatorsPage };
});

const experimentsTabLabel = i18n.translate('xpack.evals.navigation.experiments', {
  defaultMessage: 'Experiments',
});

const datasetsTabLabel = i18n.translate('xpack.evals.navigation.datasets', {
  defaultMessage: 'Datasets',
});

const evaluatorsTabLabel = i18n.translate('xpack.evals.navigation.evaluators', {
  defaultMessage: 'Evaluators',
});

const remotesTabLabel = i18n.translate('xpack.evals.navigation.remotes', {
  defaultMessage: 'Remotes',
});

const tracingTabLabel = i18n.translate('xpack.evals.navigation.tracing', {
  defaultMessage: 'Tracing',
});

const onlineTabLabel = i18n.translate('xpack.evals.navigation.online', {
  defaultMessage: 'Online Evaluations',
});

const ROOT_PATH = '/' as const;
const COMPARE_PATH = '/compare' as const;
const RUNS_PATH = '/runs' as const;
const DATASETS_PATH = '/datasets' as const;
const EVALUATORS_PATH = '/evaluators' as const;
const TRACING_PATH = '/tracing' as const;
const REMOTES_PATH = '/remotes' as const;
const ONLINE_PATH = '/online' as const;

// TODO: Show online evaluations tab when the feature is ready
const SHOW_ONLINE_EVALS_TAB = false;

const experimentDetailBreadcrumbLabel = i18n.translate('xpack.evals.breadcrumbs.experimentDetail', {
  defaultMessage: 'Experiment details',
});

const compareExperimentsBreadcrumbLabel = i18n.translate(
  'xpack.evals.breadcrumbs.compareExperiments',
  {
    defaultMessage: 'Compare experiments',
  }
);

const runOverviewBreadcrumbLabel = i18n.translate('xpack.evals.breadcrumbs.runOverview', {
  defaultMessage: 'Run overview',
});

const datasetDetailBreadcrumbLabel = i18n.translate('xpack.evals.breadcrumbs.datasetDetail', {
  defaultMessage: 'Dataset details',
});

const EvalsHeader: React.FC = () => {
  return (
    <>
      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="center"
        responsive={false}
        css={{ flexGrow: 0 }}
      >
        <EuiFlexItem>
          <EuiTitle size="l">
            <h2>{APP_TITLE}</h2>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
    </>
  );
};

const getBreadcrumbs = ({
  pathname,
  getHref,
}: {
  pathname: string;
  getHref: (path: string) => string;
}): ChromeBreadcrumb[] => {
  const experimentsHref = getHref(ROOT_PATH);
  const datasetsHref = getHref(DATASETS_PATH);
  const tracingHref = getHref(TRACING_PATH);
  const onlineHref = getHref(ONLINE_PATH);

  if (pathname.startsWith(`${TRACING_PATH}/`)) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const projectName = decodeURIComponent(parts[1]);
      return [{ text: tracingTabLabel, href: tracingHref }, { text: projectName }];
    }
  }

  if (pathname === TRACING_PATH) {
    return [{ text: tracingTabLabel }];
  }

  if (pathname.startsWith(`${ONLINE_PATH}/`)) {
    return [
      { text: onlineTabLabel, href: onlineHref },
      { text: decodeURIComponent(pathname.split('/')[2]) },
    ];
  }

  if (pathname === ONLINE_PATH) {
    return [{ text: onlineTabLabel }];
  }

  if (pathname.startsWith(`${DATASETS_PATH}/`)) {
    return [{ text: datasetsTabLabel, href: datasetsHref }, { text: datasetDetailBreadcrumbLabel }];
  }

  if (pathname === DATASETS_PATH) {
    return [{ text: datasetsTabLabel }];
  }

  if (pathname === EVALUATORS_PATH) {
    return [{ text: evaluatorsTabLabel }];
  }

  if (pathname === REMOTES_PATH) {
    return [{ text: remotesTabLabel }];
  }

  if (pathname === RUNS_PATH) {
    return [
      { text: experimentsTabLabel, href: experimentsHref },
      { text: runOverviewBreadcrumbLabel },
    ];
  }

  if (pathname.startsWith('/experiments/')) {
    return [
      { text: experimentsTabLabel, href: experimentsHref },
      { text: experimentDetailBreadcrumbLabel },
    ];
  }

  if (pathname.startsWith(COMPARE_PATH)) {
    return [
      { text: experimentsTabLabel, href: experimentsHref },
      { text: compareExperimentsBreadcrumbLabel },
    ];
  }

  return [{ text: experimentsTabLabel }];
};

const EvalsNavigation: React.FC = () => {
  const history = useHistory();
  const { pathname } = useLocation();
  const isTracingSelected = pathname.startsWith(TRACING_PATH);
  const isDatasetsSelected = pathname.startsWith(DATASETS_PATH);
  const isEvaluatorsSelected = pathname.startsWith(EVALUATORS_PATH);
  const isRemotesSelected = pathname.startsWith(REMOTES_PATH);
  const isOnlineSelected = pathname.startsWith(ONLINE_PATH);
  const isExperimentsSelected =
    !isTracingSelected &&
    !isDatasetsSelected &&
    !isEvaluatorsSelected &&
    !isRemotesSelected &&
    !isOnlineSelected;

  return (
    <div style={{ flex: '0 0 auto' }}>
      <EuiTabs size="s">
        <EuiTab isSelected={isExperimentsSelected} onClick={() => history.push(ROOT_PATH)}>
          {experimentsTabLabel}
        </EuiTab>
        <EuiTab isSelected={isDatasetsSelected} onClick={() => history.push(DATASETS_PATH)}>
          {datasetsTabLabel}
        </EuiTab>
        <EuiTab isSelected={isEvaluatorsSelected} onClick={() => history.push(EVALUATORS_PATH)}>
          {evaluatorsTabLabel}
        </EuiTab>
        <EuiTab isSelected={isTracingSelected} onClick={() => history.push(TRACING_PATH)}>
          {tracingTabLabel}
        </EuiTab>
        <EuiTab isSelected={isRemotesSelected} onClick={() => history.push(REMOTES_PATH)}>
          {remotesTabLabel}
        </EuiTab>
        {SHOW_ONLINE_EVALS_TAB ? (
          <EuiTab isSelected={isOnlineSelected} onClick={() => history.push(ONLINE_PATH)}>
            {onlineTabLabel}
          </EuiTab>
        ) : null}
      </EuiTabs>
    </div>
  );
};

const EvalsBreadcrumbs: React.FC<{
  setBreadcrumbs: (crumbs: ChromeBreadcrumb[]) => void;
  getHref: (path: string) => string;
  breadcrumbPrefix?: ChromeBreadcrumb[];
}> = ({ setBreadcrumbs, getHref, breadcrumbPrefix = [] }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    setBreadcrumbs([...breadcrumbPrefix, ...getBreadcrumbs({ pathname, getHref })]);
  }, [breadcrumbPrefix, getHref, pathname, setBreadcrumbs]);

  return null;
};

export const EvalsApp: React.FC<{
  history: AppMountParameters['history'];
  setBreadcrumbs: (crumbs: ChromeBreadcrumb[]) => void;
  getHref: (path: string) => string;
  breadcrumbPrefix?: ChromeBreadcrumb[];
}> = ({ history, setBreadcrumbs, getHref, breadcrumbPrefix }) => {
  return (
    <Router history={history}>
      <div>
        <EvalsHeader />
        <EvalsNavigation />
        <EvalsBreadcrumbs
          setBreadcrumbs={setBreadcrumbs}
          getHref={getHref}
          breadcrumbPrefix={breadcrumbPrefix}
        />
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={<EuiLoadingSpinner size="xl" />}>
            <Routes>
              <Route exact path={ROOT_PATH} component={ExperimentsListPage} />
              <Route exact path={COMPARE_PATH} component={CompareExperimentsPage} />
              <Route exact path={RUNS_PATH} component={RunOverviewPage} />
              <Route exact path={DATASETS_PATH} component={DatasetsListPage} />
              <Route exact path={EVALUATORS_PATH} component={EvaluatorsPage} />
              <Route path="/datasets/:datasetId" component={DatasetDetailPage} />
              <Route exact path={REMOTES_PATH} component={RemotesListPage} />
              <Route path="/experiments/:experimentId" component={ExperimentDetailPage} />
              <Route exact path={TRACING_PATH} component={TracingProjectsListPage} />
              <Route exact path="/tracing/:projectName" component={TracingProjectDetailPage} />
              <Route exact path={ONLINE_PATH} component={OnlineEvalsListPage} />
              <Route exact path="/online/:workflowId" component={OnlineEvalDetailPage} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </Router>
  );
};
