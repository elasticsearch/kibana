/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useRouteMatch, useParams, Redirect } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';

import { PacksPage } from './list';
import { AddPackPage } from './add';
import { EditPackPage } from './edit';
import { useBreadcrumbs } from '../../common/hooks/use_breadcrumbs';
import { useKibana } from '../../common/lib/kibana';
import { MissingPrivileges } from '../components';
import { pagePathGetters } from '../../common/page_paths';

// The read-only Pack details page was removed. Redirect the legacy
// `/packs/:packId` route to the pack's Edit page so existing bookmarks and
// deep links still resolve to that pack.
const PackDetailsRedirect = () => {
  const { packId } = useParams<{ packId: string }>();

  return <Redirect to={pagePathGetters.pack_edit({ packId })} />;
};

const PacksComponent = () => {
  const permissions = useKibana().services.application.capabilities.osquery;
  useBreadcrumbs('packs');
  const match = useRouteMatch();

  if (!permissions.readPacks) {
    return <MissingPrivileges />;
  }

  return (
    <Routes>
      <Route path={`${match.url}/add`}>
        {permissions.writePacks ? <AddPackPage /> : <MissingPrivileges />}
      </Route>
      <Route path={`${match.url}/:packId/edit`}>
        <EditPackPage />
      </Route>
      <Route path={`${match.url}/:packId`}>
        <PackDetailsRedirect />
      </Route>
      <Route path={`${match.url}`}>
        <PacksPage />
      </Route>
    </Routes>
  );
};

export const Packs = React.memo(PacksComponent);
