/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import type { SpacesApi } from '@kbn/spaces-plugin/public';
import type { UseGetCase } from '../../../containers/use_get_case';
import { useGetCase } from '../../../containers/use_get_case';
import { useKibana } from '../../../common/lib/kibana';

import { renderWithTestingProviders } from '../../../common/mock';
import CaseViewRedesign from '.';
import { screen } from '@testing-library/react';
import { caseViewProps, defaultGetCase } from '../../case_view/mocks';

jest.mock('../../../containers/use_get_case');
jest.mock('../../../common/lib/kibana');
jest.mock('../../../common/navigation/hooks');
jest.mock('../../../containers/api');
jest.mock('./case_view_page', () => ({
  CaseViewPageRedesign: () => <div data-test-subj="case-view-page-redesign" />,
}));

const useFetchCaseMock = useGetCase as jest.Mock;
const useKibanaMock = useKibana as jest.MockedFunction<typeof useKibana>;

const spacesUiApiMock = {
  redirectLegacyUrl: jest.fn().mockResolvedValue(undefined),
  components: {
    getLegacyUrlConflict: jest.fn(() => <div data-test-subj="conflict-component" />),
  },
};

describe('CaseViewRedesign', () => {
  const mockGetCase = (props: Partial<UseGetCase> = {}) => {
    const data = {
      ...defaultGetCase.data,
      ...props.data,
    };
    useFetchCaseMock.mockReturnValue({
      ...defaultGetCase,
      ...props,
      data,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCase();
    useKibanaMock().services.spaces = { ui: spacesUiApiMock } as unknown as SpacesApi;
  });

  it('should show an error if a case returns error', async () => {
    mockGetCase({ isError: true });
    renderWithTestingProviders(<CaseViewRedesign {...caseViewProps} />);

    expect(screen.getByTestId('case-view-does-not-exist')).toBeInTheDocument();
  });

  it('should return spinner if loading', async () => {
    mockGetCase({ isLoading: true });
    renderWithTestingProviders(<CaseViewRedesign {...caseViewProps} />);
    expect(screen.getByTestId('case-view-loading')).toBeInTheDocument();
  });

  it('should return case view when data is there', async () => {
    mockGetCase({ data: { ...defaultGetCase.data, outcome: 'exactMatch' } });
    renderWithTestingProviders(<CaseViewRedesign {...caseViewProps} />);

    expect(screen.getByTestId('case-view-page-redesign')).toBeInTheDocument();
    expect(spacesUiApiMock.components.getLegacyUrlConflict).not.toHaveBeenCalled();
    expect(spacesUiApiMock.redirectLegacyUrl).not.toHaveBeenCalled();
  });

  it('should redirect case view when resolves to alias match', async () => {
    const resolveAliasId = `${defaultGetCase.data.case.id}_2`;
    const resolveAliasPurpose = 'savedObjectConversion' as const;
    mockGetCase({
      data: {
        ...defaultGetCase.data,
        outcome: 'aliasMatch',
        aliasTargetId: resolveAliasId,
        aliasPurpose: resolveAliasPurpose,
      },
    });
    renderWithTestingProviders(<CaseViewRedesign {...caseViewProps} />);
    expect(spacesUiApiMock.components.getLegacyUrlConflict).not.toHaveBeenCalled();
    expect(spacesUiApiMock.redirectLegacyUrl).toHaveBeenCalledWith({
      path: `/cases/${resolveAliasId}`,
      aliasPurpose: resolveAliasPurpose,
      objectNoun: 'case',
    });
  });

  it('should redirect case view when resolves to conflict', async () => {
    const resolveAliasId = `${defaultGetCase.data.case.id}_2`;
    mockGetCase({
      data: { ...defaultGetCase.data, outcome: 'conflict', aliasTargetId: resolveAliasId },
    });

    renderWithTestingProviders(<CaseViewRedesign {...caseViewProps} />);

    expect(screen.getByTestId('conflict-component')).toBeInTheDocument();

    expect(spacesUiApiMock.redirectLegacyUrl).not.toHaveBeenCalled();
    expect(spacesUiApiMock.components.getLegacyUrlConflict).toHaveBeenCalledWith({
      objectNoun: 'case',
      currentObjectId: defaultGetCase.data.case.id,
      otherObjectId: resolveAliasId,
      otherObjectPath: `/cases/${resolveAliasId}`,
    });
  });
});
