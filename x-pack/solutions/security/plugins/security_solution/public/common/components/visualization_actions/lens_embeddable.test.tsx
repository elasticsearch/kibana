/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { screen, render } from '@testing-library/react';
import React from 'react';

import { TestProviders } from '../../mock';
import { kpiHostMetricLensAttributes } from './lens_attributes/hosts/kpi_host_metric';
import { LensEmbeddable } from './lens_embeddable';
import { useKibana } from '../../lib/kibana';
import { useActions } from './use_actions';
import { useVisualizationResponse } from './use_visualization_response';
import type { UseVisualizationResponseMock } from './use_visualization_response.mock';
import { useVisualizationResponseMock } from './use_visualization_response.mock';

const mockActions = [{ id: 'inspect' }, { id: 'openInLens' }, { id: 'addToCase' }];

jest.mock('react-redux-v7', () => {
  const actual = jest.requireActual('react-redux-v7');
  return {
    ...actual,
    dispatch: jest.fn(),
  };
});

jest.mock('./use_visualization_response', () => ({
  ...jest.requireActual('./use_visualization_response'),
  useVisualizationResponse: jest
    .requireActual('./use_visualization_response.mock')
    .useVisualizationResponseMock.create(),
}));

jest.mock('../../lib/kibana', () => {
  return {
    useKibana: jest.fn(),
  };
});

jest.mock('./use_lens_attributes', () => {
  return {
    useLensAttributes: jest.fn().mockReturnValue('mockAttributes'),
  };
});

jest.mock('./use_actions', () => {
  return {
    useActions: jest.fn(),
  };
});

const mockUseVisualizationResponse = useVisualizationResponse as UseVisualizationResponseMock;

const okResponseMock = useVisualizationResponseMock.buildOkResponse();

describe('LensEmbeddable', () => {
  const mockEmbeddableComponent = jest
    .fn()
    .mockReturnValue(<div data-test-subj="embeddableComponent" />);

  (useKibana as jest.Mock).mockReturnValue({
    services: {
      lens: {
        EmbeddableComponent: mockEmbeddableComponent,
      },
      data: {
        actions: {
          createFiltersFromValueClickAction: jest.fn(),
        },
      },
    },
  });
  (useActions as jest.Mock).mockReturnValue(mockActions);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering happy path', () => {
    beforeEach(() => {
      render(
        <TestProviders>
          <LensEmbeddable
            id="testId"
            lensAttributes={kpiHostMetricLensAttributes}
            timerange={{ from: '2022-10-27T23:00:00.000Z', to: '2022-11-04T10:46:16.204Z' }}
          />
        </TestProviders>
      );
    });

    it('should render LensComponent', () => {
      expect(screen.getByTestId('embeddableComponent')).toBeInTheDocument();
    });

    it('should render actions', () => {
      expect(mockEmbeddableComponent.mock.calls[0][0].extraActions).toEqual(mockActions);
    });

    it('should render with searchSessionId', () => {
      expect(mockEmbeddableComponent.mock.calls[0][0].searchSessionId).toEqual(
        okResponseMock.searchSessionId
      );
    });

    it('should not sync highlight state between visualizations', () => {
      expect(mockEmbeddableComponent.mock.calls[0][0].syncTooltips).toEqual(false);
      expect(mockEmbeddableComponent.mock.calls[0][0].syncCursor).toEqual(false);
    });

    it('should not render Panel settings action', () => {
      expect(
        mockEmbeddableComponent.mock.calls[0][0].disabledActions.includes('ACTION_CUSTOMIZE_PANEL')
      ).toBeTruthy();
    });
  });

  describe('when no searchSessionId exists', () => {
    it('should not render', () => {
      mockUseVisualizationResponse.mockReturnValue(
        useVisualizationResponseMock.buildNoSearchSessionIdOkResponse()
      );

      const { container } = render(
        <TestProviders>
          <LensEmbeddable
            id="testId"
            lensAttributes={kpiHostMetricLensAttributes}
            timerange={{ from: '2022-10-27T23:00:00.000Z', to: '2022-11-04T10:46:16.204Z' }}
          />
        </TestProviders>
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});
