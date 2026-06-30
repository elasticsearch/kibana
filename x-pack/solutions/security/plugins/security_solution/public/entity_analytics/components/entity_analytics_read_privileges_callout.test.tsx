/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../common/mock';
import { EntityAnalyticsReadPrivilegesCallout } from './entity_analytics_read_privileges_callout';
import type { RiskEngineMissingPrivilegesResponse } from '../hooks/use_missing_risk_engine_privileges';
import type { EntityAnalyticsPrivileges } from '../../../common/api/entity_analytics';

jest.mock('../../common/components/callouts/use_callout_storage', () => ({
  useCallOutStorage: () => ({
    isVisible: () => true,
    dismiss: jest.fn(),
  }),
}));

const ALL_PRIVILEGES_GRANTED: RiskEngineMissingPrivilegesResponse = {
  isLoading: false,
  hasAllRequiredPrivileges: true,
};

const RISK_ENGINE_PRIVILEGE = 'risk-score-index-pattern';
const ENTITY_ENGINE_PRIVILEGE = 'entities-store-index-pattern';
const CALLOUT_TITLE = 'Insufficient privileges';

const makeEntityEnginePrivileges = (
  indexPrivileges: Record<string, Record<string, boolean>>
): EntityAnalyticsPrivileges => ({
  has_all_required: true,
  has_read_permissions: true,
  privileges: {
    elasticsearch: { index: indexPrivileges },
  },
});

const renderCallout = (
  riskEngineReadPrivileges: RiskEngineMissingPrivilegesResponse,
  entityEnginePrivileges: EntityAnalyticsPrivileges | undefined,
  leadGenerationPrivileges?: EntityAnalyticsPrivileges
) =>
  render(
    <TestProviders>
      <EntityAnalyticsReadPrivilegesCallout
        riskEngineReadPrivileges={riskEngineReadPrivileges}
        entityEnginePrivileges={entityEnginePrivileges}
        leadGenerationPrivileges={leadGenerationPrivileges}
        id="entity-analytics-home"
      />
    </TestProviders>
  );

describe('EntityAnalyticsReadPrivilegesCallout', () => {
  it('renders nothing when all privileges are granted', () => {
    renderCallout(ALL_PRIVILEGES_GRANTED, makeEntityEnginePrivileges({}));

    expect(screen.queryByText(CALLOUT_TITLE)).not.toBeInTheDocument();
  });

  it('renders nothing while risk engine privileges are loading', () => {
    renderCallout({ isLoading: true }, makeEntityEnginePrivileges({}));

    expect(screen.queryByText(CALLOUT_TITLE)).not.toBeInTheDocument();
  });

  it('renders nothing when entityEnginePrivileges is undefined', () => {
    renderCallout(ALL_PRIVILEGES_GRANTED, undefined);

    expect(screen.queryByText(CALLOUT_TITLE)).not.toBeInTheDocument();
  });

  it('shows callout when risk engine has missing read index privileges', () => {
    const missingPrivileges: RiskEngineMissingPrivilegesResponse = {
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        indexPrivileges: [[RISK_ENGINE_PRIVILEGE, ['read']]],
        clusterPrivileges: { enable: [], run: [] },
      },
    };

    renderCallout(missingPrivileges, makeEntityEnginePrivileges({}));

    expect(screen.getByText(CALLOUT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(RISK_ENGINE_PRIVILEGE)).toBeInTheDocument();
  });

  it('shows callout when entity store index is missing read privilege', () => {
    const entityPrivileges = makeEntityEnginePrivileges({
      [ENTITY_ENGINE_PRIVILEGE]: { read: false, view_index_metadata: false },
    });

    renderCallout(ALL_PRIVILEGES_GRANTED, entityPrivileges);

    expect(screen.getByText(CALLOUT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(ENTITY_ENGINE_PRIVILEGE)).toBeInTheDocument();
  });

  it('combines missing privileges from both risk engine and entity store', () => {
    const missingRiskPrivileges: RiskEngineMissingPrivilegesResponse = {
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        indexPrivileges: [[RISK_ENGINE_PRIVILEGE, ['read']]],
        clusterPrivileges: { enable: [], run: [] },
      },
    };
    const entityPrivileges = makeEntityEnginePrivileges({
      [ENTITY_ENGINE_PRIVILEGE]: { read: false, view_index_metadata: false },
    });

    renderCallout(missingRiskPrivileges, entityPrivileges);

    expect(screen.getByText(CALLOUT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(RISK_ENGINE_PRIVILEGE)).toBeInTheDocument();
    expect(screen.getByText(ENTITY_ENGINE_PRIVILEGE)).toBeInTheDocument();
  });

  it('shows callout when entity store index is missing view_index_metadata even if read is true', () => {
    const entityPrivileges = makeEntityEnginePrivileges({
      [ENTITY_ENGINE_PRIVILEGE]: { read: true, view_index_metadata: false },
    });

    renderCallout(ALL_PRIVILEGES_GRANTED, entityPrivileges);

    expect(screen.getByText(CALLOUT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(ENTITY_ENGINE_PRIVILEGE)).toBeInTheDocument();
  });

  it('renders nothing when risk engine has missing privileges but empty index list', () => {
    const missingPrivileges: RiskEngineMissingPrivilegesResponse = {
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        indexPrivileges: [],
        clusterPrivileges: { enable: ['cluster-privilege'], run: [] },
      },
    };

    renderCallout(missingPrivileges, makeEntityEnginePrivileges({}));

    expect(screen.queryByText(CALLOUT_TITLE)).not.toBeInTheDocument();
  });

  it('shows callout when lead generation index is missing read privilege', () => {
    const leadsIndex = '.entity_analytics.entity-leads-*';
    const leadPrivileges = makeEntityEnginePrivileges({
      [leadsIndex]: { read: false, view_index_metadata: true },
    });

    renderCallout(ALL_PRIVILEGES_GRANTED, makeEntityEnginePrivileges({}), leadPrivileges);

    expect(screen.getByText(CALLOUT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(leadsIndex)).toBeInTheDocument();
  });

  it('combines missing privileges from risk engine, entity store, and lead generation', () => {
    const leadsIndex = '.entity_analytics.entity-leads-*';
    const missingRiskPrivileges: RiskEngineMissingPrivilegesResponse = {
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        indexPrivileges: [[RISK_ENGINE_PRIVILEGE, ['read']]],
        clusterPrivileges: { enable: [], run: [] },
      },
    };
    const entityPrivileges = makeEntityEnginePrivileges({
      [ENTITY_ENGINE_PRIVILEGE]: { read: false, view_index_metadata: false },
    });
    const leadPrivileges = makeEntityEnginePrivileges({
      [leadsIndex]: { read: false, view_index_metadata: true },
    });

    renderCallout(missingRiskPrivileges, entityPrivileges, leadPrivileges);

    expect(screen.getByText(CALLOUT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(RISK_ENGINE_PRIVILEGE)).toBeInTheDocument();
    expect(screen.getByText(ENTITY_ENGINE_PRIVILEGE)).toBeInTheDocument();
    expect(screen.getByText(leadsIndex)).toBeInTheDocument();
  });

  it('renders nothing when lead generation privileges are undefined', () => {
    renderCallout(ALL_PRIVILEGES_GRANTED, makeEntityEnginePrivileges({}), undefined);

    expect(screen.queryByText(CALLOUT_TITLE)).not.toBeInTheDocument();
  });
});
