/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';
import { MemoryRouter } from '@kbn/shared-ux-router';
import { Route } from '@kbn/shared-ux-router';
import type { RouteComponentProps } from 'react-router-dom';
import type { History } from 'history';
import type { HttpSetup } from '@kbn/core/public';

import { IndexDetailsSection } from '../../../common/constants';
import { DetailsPage } from '../../../public/application/sections/home/index_list/details_page/details_page';
import { WithAppDependencies } from '../helpers/setup_environment';

export const renderIndexDetailsPage = async ({
  httpSetup,
  indexName,
  initialEntry,
  indexDetailsSection = IndexDetailsSection.Settings,
  deps = {},
}: {
  httpSetup: HttpSetup;
  indexName: string;
  initialEntry?: string;
  indexDetailsSection?: IndexDetailsSection;
  deps?: Record<string, unknown>;
}) => {
  const route = initialEntry ?? `/indices/index_details?indexName=${indexName}`;
  let capturedHistory!: History;

  const Comp = WithAppDependencies(
    () => (
      <MemoryRouter initialEntries={[route]}>
        <Route
          path="/indices/index_details"
          render={(props: RouteComponentProps) => (
            <DetailsPage
              {...props}
              match={{
                ...props.match,
                params: {
                  indexName,
                  indexDetailsSection,
                },
              }}
              history={(capturedHistory = props.history)}
            />
          )}
        />
      </MemoryRouter>
    ),
    httpSetup,
    {
      url: { locators: { get: () => ({ navigate: jest.fn(), getUrl: jest.fn() }) } },
      ...deps,
    }
  );

  render(<Comp />);
  await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
  return { history: capturedHistory };
};
