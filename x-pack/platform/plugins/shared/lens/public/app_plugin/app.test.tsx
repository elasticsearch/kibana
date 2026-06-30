/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Observable, Subject } from 'rxjs';
import { act } from 'react-dom/test-utils';
import { App } from './app';
import type { LensAppProps } from './types';
import type {
  LensDocument,
  LensAppServices,
  LensAppState,
  VisualizeEditorContext,
} from '@kbn/lens-common';
import {
  visualizationMap,
  datasourceMap,
  makeDefaultServices,
  renderWithReduxStore,
  mockStoreDeps,
  defaultDoc,
} from '../mocks';
import { createMemoryHistory } from 'history';
import type { Query } from '@kbn/es-query';
import { FilterManager } from '@kbn/data-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { buildExistsFilter, FilterStateStore } from '@kbn/es-query';
import type { FieldSpec } from '@kbn/data-plugin/common';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { serverlessMock } from '@kbn/serverless/public/mocks';
import moment from 'moment';
import { setState } from '../state_management';
import { coreMock } from '@kbn/core/public/mocks';
import type { LensSerializedState } from '..';
import { createMockedField, createMockedIndexPattern } from '../datasources/form_based/mocks';
import { faker } from '@faker-js/faker';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setMockedPresentationUtilServices } from '@kbn/presentation-util-plugin/public/mocks';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { EditorFrameServiceProvider } from '../editor_frame_service/editor_frame_service_context';

jest.mock('lodash', () => ({
  ...jest.requireActual('lodash'),
  debounce: (fn: unknown) => fn,
}));

// Force the `xl` breakpoint so the AppHeader app menu renders its items inline
// instead of collapsing them into the overflow popover (jsdom defaults to `l`).
jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  useIsWithinBreakpoints: (breakpoints: string[]) => breakpoints.includes('xl'),
}));

const defaultSavedObjectId: string = faker.string.uuid();

const waitToLoad = async () =>
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

function getLensDocumentMock(propsOverrides?: Partial<LensDocument>) {
  return structuredClone({ ...defaultDoc, ...propsOverrides });
}

describe('Lens App', () => {
  let props: jest.Mocked<LensAppProps>;
  let services: jest.Mocked<LensAppServices> = makeDefaultServices(
    new Subject<string>(),
    'sessionId-1'
  );
  beforeAll(() => setMockedPresentationUtilServices());

  beforeEach(() => {
    props = {
      editorFrame: {
        EditorFrameContainer: jest.fn((_) => <div>Editor frame</div>),
        datasourceMap,
        visualizationMap,
      },
      history: createMemoryHistory(),
      redirectTo: jest.fn(),
      redirectToOrigin: jest.fn(),
      onAppLeave: jest.fn(),
      setHeaderActionMenu: jest.fn(),
      topNavMenuEntryGenerators: [],
      theme$: new Observable(),
      coreStart: coreMock.createStart(),
    };

    services = makeDefaultServices(new Subject<string>(), 'sessionId-1');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderApp({
    preloadedState,
    datasourceMapOverride,
  }: {
    preloadedState?: Partial<LensAppState>;
    datasourceMapOverride?: typeof datasourceMap;
  } = {}) {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <KibanaContextProvider services={services}>
        <ChromeServiceProvider value={{ chrome: chromeServiceMock.createStartContract() }}>
          <EditorFrameServiceProvider
            visualizationMap={visualizationMap}
            datasourceMap={datasourceMapOverride ?? datasourceMap}
          >
            {children}
          </EditorFrameServiceProvider>
        </ChromeServiceProvider>
      </KibanaContextProvider>
    );

    const {
      store,
      render: renderRtl,
      rerender,
      ...rest
    } = renderWithReduxStore(
      <App {...props} />,
      { wrapper: Wrapper },
      {
        storeDeps: mockStoreDeps({ lensServices: services }),
        preloadedState,
      }
    );

    const rerenderWithProps = (newProps: Partial<LensAppProps>) => {
      rerender(<App {...props} {...newProps} />, {
        wrapper: Wrapper,
      });
    };

    await act(async () => await store.dispatch(setState({ ...preloadedState })));
    return { props, lensStore: store, rerender: rerenderWithProps, ...rest };
  }

  it('renders the editor frame', async () => {
    await renderApp();
    expect(screen.getByText('Editor frame')).toBeInTheDocument();
  });

  it('updates global filters with store state', async () => {
    const pinnedField = createMockedField({ name: 'pinnedField', type: '' });
    const indexPattern = createMockedIndexPattern({ id: 'index1' }, [pinnedField]);
    const pinnedFilter = buildExistsFilter(pinnedField, indexPattern);
    services.data.query.filterManager.getFilters = jest.fn().mockReturnValue([]);
    services.data.query.filterManager.getGlobalFilters = jest.fn().mockReturnValue([pinnedFilter]);
    const { lensStore } = await renderApp();

    expect(lensStore.getState()).toEqual({
      lens: expect.objectContaining({
        query: { query: '', language: 'lucene' },
        filters: [pinnedFilter],
        resolvedDateRange: {
          fromDate: 'now-7d',
          toDate: 'now',
        },
      }),
    });

    expect(services.data.query.filterManager.getFilters).not.toHaveBeenCalled();
  });

  describe('extra nav menu entries', () => {
    it('shows custom menu entry', async () => {
      const runFn = jest.fn();
      props.topNavMenuEntryGenerators = [
        () => ({
          label: 'My entry',
          testId: 'lnsApp_myEntry',
          run: runFn,
        }),
      ];
      await renderApp();
      const entry = screen.getByTestId('lnsApp_myEntry');
      expect(entry).toBeInTheDocument();
      await userEvent.click(entry);
      expect(runFn).toHaveBeenCalled();
    });

    it('passes current state, filter, query timerange and initial context into getter', async () => {
      const getterFn = jest.fn();
      const preloadedState = {
        visualization: {
          activeId: 'lensXY',
          state: {
            visState: true,
          },
          selectedLayerId: null,
        },
        activeDatasourceId: 'formBased',
        datasourceStates: {
          formBased: {
            isLoading: false,
            state: { datasourceState: true },
          },
        },
        query: {
          language: 'kuery',
          query: 'A: B',
        },
        filters: [
          {
            meta: {
              key: 'abc',
            },
          },
        ],
      };
      props.topNavMenuEntryGenerators = [getterFn];
      props.initialContext = {
        fieldName: 'a',
        dataViewSpec: { id: '1' },
      };
      await renderApp({
        preloadedState,
      });

      expect(getterFn).toHaveBeenCalledWith(
        expect.objectContaining({
          initialContext: {
            fieldName: 'a',
            dataViewSpec: { id: '1' },
          },
          visualizationState: preloadedState.visualization.state,
          visualizationId: preloadedState.visualization.activeId,
          query: preloadedState.query,
          filters: preloadedState.filters,
          datasourceStates: {
            formBased: {
              isLoading: false,
              state: preloadedState.datasourceStates.formBased.state,
            },
          },
        })
      );
    });
  });

  describe('breadcrumbs', () => {
    const breadcrumbDocSavedObjectId = faker.string.uuid();
    const breadcrumbDoc = getLensDocumentMock({
      savedObjectId: breadcrumbDocSavedObjectId,
      title: 'Daaaaaaadaumching!',
    });

    it('sets breadcrumbs when the document title changes', async () => {
      // Override the default mock to ensure no originating app
      services.getOriginatingAppName = jest.fn(() => undefined);
      const { lensStore } = await renderApp();

      const dashboardsBreadcrumb = {
        text: 'Dashboards',
        href: services.application.getUrlForApp('dashboards', { path: '#/list' }),
      };
      const visualizationsBreadcrumb = {
        text: 'Visualizations',
        href: services.application.getUrlForApp('dashboards', { path: '#/list/visualizations' }),
      };
      const expectedCreateBreadcrumbs = [
        dashboardsBreadcrumb,
        visualizationsBreadcrumb,
        { text: 'Create' },
      ];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedCreateBreadcrumbs, {
        project: { value: expectedCreateBreadcrumbs, absolute: true },
      });

      await act(async () => {
        await lensStore.dispatch(
          setState({
            persistedDoc: breadcrumbDoc,
          })
        );
      });

      const expectedSavedBreadcrumbs = [
        dashboardsBreadcrumb,
        visualizationsBreadcrumb,
        { text: 'Daaaaaaadaumching!' },
      ];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedSavedBreadcrumbs, {
        project: { value: expectedSavedBreadcrumbs, absolute: true },
      });
    });

    it('sets originatingApp breadcrumb when the document title changes', async () => {
      props.incomingState = { originatingApp: 'dashboards' };
      services.getOriginatingAppName = jest.fn(() => 'The Coolest Container Ever Made');
      const { lensStore, rerender } = await renderApp({
        preloadedState: { isLinkedToOriginatingApp: false },
      });

      const expectedOriginCreateBreadcrumbs = [
        {
          text: 'The Coolest Container Ever Made',
          onClick: expect.anything(),
        },
        { text: 'Create' },
      ];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedOriginCreateBreadcrumbs, {
        project: { value: expectedOriginCreateBreadcrumbs, absolute: true },
      });

      await act(async () => {
        await rerender({ initialInput: { ref_id: breadcrumbDocSavedObjectId } });

        lensStore.dispatch(
          setState({
            persistedDoc: breadcrumbDoc,
          })
        );
      });

      const expectedOriginSavedBreadcrumbs = [
        {
          text: 'The Coolest Container Ever Made',
          onClick: expect.anything(),
        },
        { text: 'Daaaaaaadaumching!' },
      ];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedOriginSavedBreadcrumbs, {
        project: { value: expectedOriginSavedBreadcrumbs, absolute: true },
      });
    });

    it('sets serverless breadcrumbs when the document title changes when serverless service is available', async () => {
      const serverless = serverlessMock.createStart();
      services.serverless = serverless;
      const { lensStore, rerender } = await renderApp();
      expect(services.chrome.setBreadcrumbs).not.toHaveBeenCalled();
      expect(serverless.setBreadcrumbs).toHaveBeenCalledWith({ text: 'Create' });

      await act(async () => {
        rerender({ initialInput: { ref_id: breadcrumbDocSavedObjectId } });
        lensStore.dispatch(
          setState({
            persistedDoc: breadcrumbDoc,
          })
        );
      });

      expect(services.chrome.setBreadcrumbs).not.toHaveBeenCalled();
      expect(serverless.setBreadcrumbs).toHaveBeenCalledWith({ text: 'Daaaaaaadaumching!' });
    });

    it('prepends incomingBreadcrumbs from incomingState when provided', async () => {
      const incomingBreadcrumbs = [
        { text: 'My Dashboard', href: '/app/dashboards#/view/123' },
        { text: 'Visualizations', href: '/app/dashboards#/list/visualizations' },
      ];
      props.incomingState = {
        originatingApp: 'dashboards',
        breadcrumbs: incomingBreadcrumbs,
      };
      services.getOriginatingAppName = jest.fn(() => 'My Dashboard');
      const { lensStore } = await renderApp();

      const expectedCreateBreadcrumbs = [...incomingBreadcrumbs, { text: 'Create' }];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedCreateBreadcrumbs, {
        project: { value: expectedCreateBreadcrumbs, absolute: true },
      });

      await act(async () => {
        lensStore.dispatch(setState({ persistedDoc: breadcrumbDoc }));
      });

      const expectedSavedBreadcrumbs = [...incomingBreadcrumbs, { text: 'Daaaaaaadaumching!' }];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedSavedBreadcrumbs, {
        project: { value: expectedSavedBreadcrumbs, absolute: true },
      });
    });

    it('falls back to incomingBreadcrumbs from initialContext when incomingState has no breadcrumbs', async () => {
      const contextBreadcrumbs = [
        { text: 'Dashboards', href: '/app/dashboards#/list' },
        { text: 'Visualizations', href: '/app/dashboards#/list/visualizations' },
      ];
      props.incomingState = undefined;
      props.initialContext = {
        isVisualizeAction: true,
        breadcrumbs: contextBreadcrumbs,
      } as VisualizeEditorContext;
      services.getOriginatingAppName = jest.fn(() => undefined);
      const { lensStore } = await renderApp();

      const expectedCreateBreadcrumbs = [...contextBreadcrumbs, { text: 'Create' }];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedCreateBreadcrumbs, {
        project: { value: expectedCreateBreadcrumbs, absolute: true },
      });

      await act(async () => {
        lensStore.dispatch(setState({ persistedDoc: breadcrumbDoc }));
      });

      const expectedSavedBreadcrumbs = [...contextBreadcrumbs, { text: 'Daaaaaaadaumching!' }];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedSavedBreadcrumbs, {
        project: { value: expectedSavedBreadcrumbs, absolute: true },
      });
    });

    it('incomingState breadcrumbs take precedence over initialContext breadcrumbs when both are present', async () => {
      const stateBreadcrumbs = [{ text: 'From State', href: '/app/dashboards#/view/state' }];
      const contextBreadcrumbs = [{ text: 'From Context', href: '/app/dashboards#/list' }];
      props.incomingState = {
        originatingApp: 'dashboards',
        breadcrumbs: stateBreadcrumbs,
      };
      props.initialContext = {
        isVisualizeAction: true,
        breadcrumbs: contextBreadcrumbs,
      } as VisualizeEditorContext;
      services.getOriginatingAppName = jest.fn(() => 'From State');
      await renderApp();

      const expectedBreadcrumbs = [...stateBreadcrumbs, { text: 'Create' }];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedBreadcrumbs, {
        project: { value: expectedBreadcrumbs, absolute: true },
      });
      // Context breadcrumbs must NOT appear
      expect(services.chrome.setBreadcrumbs).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ text: 'From Context' })]),
        expect.anything()
      );
    });

    it('shows "Edit visualization" title in by-value mode (linked to origin, no savedObjectId)', async () => {
      props.incomingState = { originatingApp: 'dashboards', originatingPath: '/view/123' };
      services.getOriginatingAppName = jest.fn(() => 'My Dashboard');
      const { lensStore } = await renderApp({
        preloadedState: { isLinkedToOriginatingApp: true },
      });

      // Dispatch a persisted doc — by-value means isLinkedToOriginatingApp && !savedObjectId
      // so initialInput has no ref_id, therefore savedObjectId is undefined
      await act(async () => {
        lensStore.dispatch(setState({ persistedDoc: breadcrumbDoc }));
      });

      const expectedByValueBreadcrumbs = [
        { text: 'My Dashboard', onClick: expect.anything() },
        { text: 'Edit visualization' },
      ];
      expect(services.chrome.setBreadcrumbs).toHaveBeenCalledWith(expectedByValueBreadcrumbs, {
        project: { value: expectedByValueBreadcrumbs, absolute: true },
      });
    });

    it('does not update breadcrumbs when savedObjectId is set but persistedDoc has not loaded yet', async () => {
      services.getOriginatingAppName = jest.fn(() => undefined);
      props.initialInput = { ref_id: breadcrumbDocSavedObjectId };
      await renderApp({ preloadedState: { persistedDoc: undefined } });

      expect(services.chrome.setBreadcrumbs).not.toHaveBeenCalled();
    });
  });

  describe('TopNavMenu#showDatePicker', () => {
    it('shows date picker if any used index pattern isTimeBased', async () => {
      services.dataViews.get = jest
        .fn()
        .mockImplementation(
          async (id) => ({ id, isTimeBased: () => true, isPersisted: () => true } as DataView)
        );
      await renderApp();
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({ showDatePicker: true }),
        {}
      );
    });
    it('shows date picker if active datasource isTimeBased', async () => {
      services.dataViews.get = jest
        .fn()
        .mockImplementation(
          async (id) => ({ id, isTimeBased: () => true, isPersisted: () => true } as DataView)
        );

      await renderApp({
        datasourceMapOverride: {
          ...datasourceMap,
          formBased: {
            ...datasourceMap.formBased,
            isTimeBased: jest.fn((_state, _indexPatterns) => true),
          },
        },
      });
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({ showDatePicker: true }),
        {}
      );
    });
    it('does not show date picker if index pattern nor active datasource is not time based', async () => {
      services.dataViews.get = jest
        .fn()
        .mockImplementation(
          async (id) => ({ id, isTimeBased: () => true, isPersisted: () => true } as DataView)
        );

      await renderApp({
        datasourceMapOverride: {
          ...datasourceMap,
          formBased: {
            ...datasourceMap.formBased,
            isTimeBased: jest.fn((_state, _indexPatterns) => false),
          },
        },
      });
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({ showDatePicker: false }),
        {}
      );
    });
  });

  describe('TopNavMenu#dataViewPickerProps', () => {
    it('calls the nav component with the correct dataview picker props if permissions are given', async () => {
      const { lensStore } = await renderApp();
      services.dataViewEditor.userPermissions.editDataView = () => true;
      const document = {
        savedObjectId: defaultSavedObjectId,
        state: {
          query: 'fake query',
          filters: [{ query: { match_phrase: { src: 'test' } } }],
        },
        references: [{ type: 'index-pattern', id: '1', name: 'index-pattern-0' }],
      } as unknown as LensDocument;

      (services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock).mockClear();
      act(() => {
        lensStore.dispatch(
          setState({
            query: 'fake query' as unknown as Query,
            persistedDoc: document,
          })
        );
      });
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          dataViewPickerComponentProps: expect.objectContaining({
            currentDataViewId: 'mockip',
            onChangeDataView: expect.any(Function),
            onDataViewCreated: expect.any(Function),
            onAddField: expect.any(Function),
          }),
        }),
        {}
      );
    });
  });

  describe('persistence', () => {
    it('passes query and indexPatterns to TopNavMenu', async () => {
      const { lensStore } = await renderApp();
      const query = { query: 'fake query', language: 'kuery' };
      const document = getLensDocumentMock({
        savedObjectId: defaultSavedObjectId,
        state: {
          ...defaultDoc.state,
          query,
          filters: [{ query: { match_phrase: { src: 'test' } }, meta: {} }],
        },
        references: [{ type: 'index-pattern', id: '1', name: 'index-pattern-0' }],
      });

      await act(async () => {
        await lensStore.dispatch(
          setState({
            query,
            persistedDoc: document,
          })
        );
      });

      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          query,
          indexPatterns: [
            {
              id: 'mockip',
              isTimeBased: expect.any(Function),
              fields: [],
              isPersisted: expect.any(Function),
              toSpec: expect.any(Function),
            },
          ],
        }),
        {}
      );
    });
    it('handles rejected index pattern', async () => {
      services.dataViews.get = jest
        .fn()
        .mockResolvedValue(Promise.reject({ reason: 'Could not locate that data view' }));
      await renderApp();
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({ indexPatterns: [] }),
        {}
      );
    });

    describe('save buttons', () => {
      const querySaveButton = () => screen.queryByTestId('lnsApp_saveButton');
      const clickSaveButton = async () =>
        await act(async () => await userEvent.click(screen.getByTestId('lnsApp_saveButton')));

      const querySaveAndReturnButton = () => screen.queryByTestId('lnsApp_saveAndReturnButton');
      const waitForModalVisible = async () =>
        await waitFor(() => screen.getByTestId('savedObjectTitle'));

      async function save({
        preloadedState,
        savedObjectId = defaultSavedObjectId,
        prevSavedObjectId = undefined,
        newTitle = 'hello there',
        newCopyOnSave = false,
        comesFromDashboard = true,
        switchToAddToDashboardNone = false,
      }: {
        newCopyOnSave?: boolean;
        newTitle?: string;
        preloadedState?: Partial<LensAppState>;
        prevSavedObjectId?: string;
        savedObjectId?: string;
        comesFromDashboard?: boolean;
        switchToAddToDashboardNone?: boolean;
      }) {
        services.attributeService.saveToLibrary = jest.fn().mockResolvedValue(savedObjectId);
        services.attributeService.loadFromLibrary = jest.fn().mockResolvedValue({
          sharingSavedObjectProps: {
            outcome: 'exactMatch',
          },
          attributes: {
            savedObjectId,
            references: [],
            state: {
              query: { query: 'fake query', language: 'kuery' },
              filters: [],
            },
          },
          managed: false,
        });

        props = {
          ...props,
          initialInput: prevSavedObjectId ? { ref_id: prevSavedObjectId } : undefined,
        };

        if (comesFromDashboard) {
          props.incomingState = {
            originatingApp: 'dashboards',
            originatingPath: '#/view/123',
          };
        }

        const { lensStore } = await renderApp({
          preloadedState: {
            isSaveable: true,
            isLinkedToOriginatingApp: comesFromDashboard,
            ...preloadedState,
          },
        });
        await clickSaveButton();
        await waitForModalVisible();
        if (newCopyOnSave) {
          await userEvent.click(screen.getByTestId('saveAsNewCheckbox'));
        }
        if (switchToAddToDashboardNone) {
          await userEvent.click(screen.getByLabelText('None'));
        }
        await waitFor(async () => {
          await userEvent.clear(screen.getByTestId('savedObjectTitle'));
          expect(screen.getByTestId('savedObjectTitle')).toHaveValue('');
        });
        await userEvent.type(screen.getByTestId('savedObjectTitle'), `${newTitle}`);
        await userEvent.click(screen.getByTestId('confirmSaveSavedObjectButton'));
        await waitToLoad();
        return { props, lensStore };
      }

      it('shows a disabled save button when the user does not have permissions', async () => {
        services.application.capabilities = {
          ...services.application.capabilities,
          visualize_v2: { save: false, show: true },
          dashboard_v2: {
            showWriteControls: false,
          },
        };
        await renderApp({ preloadedState: { isSaveable: true } });
        expect(querySaveButton()).toBeDisabled();
      });

      it('shows a save button that is enabled when the frame has provided its state and does not show save and return or save as', async () => {
        await renderApp({
          preloadedState: { isSaveable: true },
        });

        expect(querySaveButton()).toHaveTextContent('Save');
        expect(querySaveAndReturnButton()).toBeFalsy();
      });

      it('Shows Save and Return and Save to library buttons in create by value mode with originating app', async () => {
        props.incomingState = {
          originatingApp: 'dashboards',
          originatingPath: '#/view/123',
          valueInput: {
            id: 'whatchaGonnaDoWith',
            attributes: {
              title:
                'whatcha gonna do with all these references? All these references in your value Input',
              references: [],
            },
          } as unknown as LensSerializedState,
        };
        await renderApp({
          preloadedState: {
            isLinkedToOriginatingApp: true,
            isSaveable: true,
          },
        });

        expect(querySaveAndReturnButton()).toBeEnabled();
        expect(querySaveButton()).toHaveTextContent('Save to library');
      });

      it('Shows Save and Return and Save As buttons in edit by reference mode', async () => {
        props.incomingState = {
          originatingApp: 'dashboards',
          originatingPath: '#/view/123',
        };
        props.initialInput = { ref_id: defaultSavedObjectId, id: '5678' };
        await renderApp({
          preloadedState: {
            isSaveable: true,
            isLinkedToOriginatingApp: true,
          },
        });

        expect(querySaveAndReturnButton()).toBeEnabled();
        expect(querySaveButton()).toHaveTextContent('Save as');
      });

      it('applies all changes on-save', async () => {
        const { lensStore } = await save({
          savedObjectId: undefined,
          newCopyOnSave: false,
          newTitle: 'hello there',
          preloadedState: {
            applyChangesCounter: 0,
          },
        });
        expect(lensStore.getState().lens.applyChangesCounter).toBe(1);
      });
      it('adds to the recently accessed list on save', async () => {
        const savedObjectId = faker.string.uuid();
        await save({ savedObjectId, prevSavedObjectId: 'prevId', comesFromDashboard: false });
        expect(services.chrome.recentlyAccessed.add).toHaveBeenCalledWith(
          `/app/lens#/edit/${savedObjectId}`,
          'hello there',
          savedObjectId
        );
      });

      it('saves new docs', async () => {
        await save({
          prevSavedObjectId: undefined,
          savedObjectId: defaultSavedObjectId,
          newTitle: 'hello there',
          comesFromDashboard: false,
          switchToAddToDashboardNone: true,
        });
        expect(services.attributeService.saveToLibrary).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'hello there',
          }),
          // from mocks
          [
            {
              id: 'mockip',
              name: 'mockip',
              type: 'index-pattern',
            },
          ],
          undefined
        );
        expect(props.redirectTo).toHaveBeenCalledWith(defaultSavedObjectId);
        expect(services.notifications.toasts.addSuccess).toHaveBeenCalledWith(
          "Saved 'hello there'"
        );
      });

      it('saves existing docs as a copy', async () => {
        const doc = getLensDocumentMock();
        await save({
          savedObjectId: doc.savedObjectId,
          newCopyOnSave: true,
          newTitle: 'hello there',
          preloadedState: { persistedDoc: doc },
          prevSavedObjectId: 'prevId',
          comesFromDashboard: false,
        });
        expect(services.attributeService.saveToLibrary).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'hello there',
          }),
          [{ id: 'mockip', name: 'mockip', type: 'index-pattern' }],
          undefined
        );
        // new copy gets a new SO id
        expect(props.redirectTo).toHaveBeenCalledWith(doc.savedObjectId);
        expect(services.attributeService.saveToLibrary).toHaveBeenCalledTimes(1);
        expect(services.notifications.toasts.addSuccess).toHaveBeenCalledWith(
          "Saved 'hello there'"
        );
      });

      it('saves existing docs', async () => {
        await save({
          savedObjectId: defaultSavedObjectId,
          prevSavedObjectId: defaultSavedObjectId,
          newCopyOnSave: false,
          newTitle: 'hello there',
          comesFromDashboard: false,
          preloadedState: {
            persistedDoc: getLensDocumentMock({ savedObjectId: defaultSavedObjectId }),
          },
        });
        expect(services.attributeService.saveToLibrary).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'hello there',
          }),
          [{ id: 'mockip', name: 'mockip', type: 'index-pattern' }],
          defaultSavedObjectId
        );
        expect(props.redirectTo).not.toHaveBeenCalled();
        expect(services.notifications.toasts.addSuccess).toHaveBeenCalledWith(
          "Saved 'hello there'"
        );
      });

      it('saves app filters and does not save pinned filters', async () => {
        const indexPattern = { id: 'index1', isPersisted: () => true } as unknown as DataView;
        const field = { name: 'myfield' } as unknown as FieldSpec;
        const pinnedField = { name: 'pinnedField' } as unknown as FieldSpec;
        const unpinned = buildExistsFilter(field, indexPattern);
        const pinned = buildExistsFilter(pinnedField, indexPattern);
        await act(async () => {
          FilterManager.setFiltersStore([pinned], FilterStateStore.GLOBAL_STATE);
        });

        await save({
          savedObjectId: defaultSavedObjectId,
          prevSavedObjectId: defaultSavedObjectId,
          preloadedState: {
            isSaveable: true,
            persistedDoc: getLensDocumentMock({ savedObjectId: defaultSavedObjectId }),
            isLinkedToOriginatingApp: true,
            filters: [pinned, unpinned],
          },
        });

        const { state: expectedFilters } = services.data.query.filterManager.extract([unpinned]);

        expect(services.attributeService.saveToLibrary).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'hello there',
            state: expect.objectContaining({ filters: expectedFilters }),
          }),
          [{ id: 'mockip', name: 'mockip', type: 'index-pattern' }],
          undefined
        );
      });

      it('saves new doc and redirects to originating app', async () => {
        await save({
          savedObjectId: undefined,
          newCopyOnSave: false,
          newTitle: 'hello there',
        });
        expect(services.attributeService.saveToLibrary).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'hello there',
          }),
          [{ id: 'mockip', name: 'mockip', type: 'index-pattern' }],
          undefined
        );
        expect(props.redirectToOrigin).toHaveBeenCalledWith({
          state: expect.objectContaining({ ref_id: defaultSavedObjectId }),
          isCopied: false,
        });
      });

      it('handles save failure by showing a warning, but still allows another save', async () => {
        services.attributeService.saveToLibrary = jest
          .fn()
          .mockRejectedValue({ message: 'failed' });

        props.incomingState = {
          originatingApp: 'dashboards',
          originatingPath: '#/view/123',
        };

        await renderApp({
          preloadedState: {
            isSaveable: true,
            isLinkedToOriginatingApp: true,
          },
        });
        await clickSaveButton();
        await userEvent.type(screen.getByTestId('savedObjectTitle'), 'hello there');
        await userEvent.click(screen.getByTestId('confirmSaveSavedObjectButton'));
        await waitToLoad();

        expect(props.redirectTo).not.toHaveBeenCalled();
        expect(services.attributeService.saveToLibrary).toHaveBeenCalled();
        expect(services.notifications.toasts.addDanger).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringContaining('failed'),
          })
        );
      });

      it('does not show the copy button on first save', async () => {
        props.incomingState = {
          originatingApp: 'dashboards',
        };

        await renderApp({
          preloadedState: { isSaveable: true, isLinkedToOriginatingApp: true },
        });
        await clickSaveButton();
        await waitForModalVisible();
        expect(screen.queryByTestId('saveAsNewCheckbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('share button', () => {
    const getShareButton = () => screen.getByTestId(/lnsApp_shareButton/);

    it('should be disabled when no data is available', async () => {
      await renderApp({ preloadedState: { isSaveable: true } });
      expect(getShareButton()).toBeDisabled();
    });

    it('should not disable share when not saveable', async () => {
      await renderApp({
        preloadedState: {
          isSaveable: false,
          activeData: { layer1: { type: 'datatable', columns: [], rows: [] } },
        },
      });

      expect(getShareButton()).toBeEnabled();
    });

    it('should still be enabled even if the user is missing save permissions', async () => {
      services.application.capabilities = {
        ...services.application.capabilities,
        visualize_v2: { save: false, show: true, createShortUrl: true },
      };

      await renderApp({
        preloadedState: {
          isSaveable: true,
          activeData: { layer1: { type: 'datatable', columns: [], rows: [] } },
        },
      });
      expect(getShareButton()).toBeEnabled();
    });

    it('should still be enabled even if the user is missing shortUrl permissions', async () => {
      services.application.capabilities = {
        ...services.application.capabilities,
        visualize_v2: { save: true, show: true, createShortUrl: false },
      };

      await renderApp({
        preloadedState: {
          isSaveable: true,
          activeData: { layer1: { type: 'datatable', columns: [], rows: [] } },
        },
      });

      expect(getShareButton()).toBeEnabled();
    });

    it('should be disabled if the user is missing shortUrl permissions and visualization is not saveable', async () => {
      services.application.capabilities = {
        ...services.application.capabilities,
        visualize_v2: { save: false, show: true, createShortUrl: false },
      };

      await renderApp({
        preloadedState: {
          isSaveable: false,
          activeData: { layer1: { type: 'datatable', columns: [], rows: [] } },
        },
      });
      expect(getShareButton()).toBeDisabled();
    });
  });

  describe('inspector', () => {
    it('inspector button should be available', async () => {
      await renderApp({
        preloadedState: { isSaveable: true },
      });
      expect(screen.getByTestId('lnsApp_inspectButton')).toBeEnabled();
    });
    it('should open inspect panel', async () => {
      await renderApp({
        preloadedState: { isSaveable: true },
      });
      await userEvent.click(screen.getByTestId('lnsApp_inspectButton'));
      expect(services.inspector.inspect).toHaveBeenCalledTimes(1);
    });
  });

  describe('query bar state management', () => {
    it('uses the default time and query language settings', async () => {
      const { lensStore } = await renderApp();
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { query: '', language: 'lucene' },
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
        }),
        {}
      );

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          query: { query: '', language: 'lucene' },
          resolvedDateRange: {
            fromDate: 'now-7d',
            toDate: 'now',
          },
        }),
      });
    });

    it('updates the editor frame when the user changes query or time in the search bar', async () => {
      const { lensStore } = await renderApp();
      (services.data.query.timefilter.timefilter.calculateBounds as jest.Mock).mockReturnValue({
        min: moment('2021-01-09T04:00:00.000Z'),
        max: moment('2021-01-09T08:00:00.000Z'),
      });
      const onQuerySubmit = (services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock).mock
        .calls[0][0].onQuerySubmit;
      await act(async () =>
        onQuerySubmit({
          dateRange: { from: 'now-14d', to: 'now-7d' },
          query: { query: 'new', language: 'lucene' },
        })
      );

      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { query: 'new', language: 'lucene' },
          dateRangeFrom: 'now-14d',
          dateRangeTo: 'now-7d',
        }),
        {}
      );
      expect(services.data.query.timefilter.timefilter.setTime).toHaveBeenCalledWith({
        from: 'now-14d',
        to: 'now-7d',
      });

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          query: { query: 'new', language: 'lucene' },
          resolvedDateRange: {
            fromDate: 'now-14d',
            toDate: 'now-7d',
          },
        }),
      });
    });

    it('updates the filters when the user changes them', async () => {
      const { lensStore } = await renderApp();
      const indexPattern = { id: 'index1', isPersisted: () => true } as unknown as DataView;
      const field = { name: 'myfield' } as unknown as FieldSpec;
      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          filters: [],
        }),
      });

      act(() =>
        services.data.query.filterManager.setFilters([buildExistsFilter(field, indexPattern)])
      );

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          filters: [buildExistsFilter(field, indexPattern)],
        }),
      });
    });

    it('updates the searchSessionId when the user changes query or time in the search bar', async () => {
      const { lensStore } = await renderApp();

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-1`,
        }),
      });

      const AggregateQuerySearchBar = services.unifiedSearch.ui
        .AggregateQuerySearchBar as jest.Mock;
      const onQuerySubmit = AggregateQuerySearchBar.mock.calls[0][0].onQuerySubmit;
      act(() =>
        onQuerySubmit({
          dateRange: { from: 'now-14d', to: 'now-7d' },
          query: { query: '', language: 'lucene' },
        })
      );

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-2`,
        }),
      });
      // trigger again, this time changing just the query
      act(() =>
        onQuerySubmit({
          dateRange: { from: 'now-14d', to: 'now-7d' },
          query: { query: 'new', language: 'lucene' },
        })
      );

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-3`,
        }),
      });
      const indexPattern = { id: 'index1', isPersisted: () => true } as unknown as DataView;
      const field = { name: 'myfield' } as unknown as FieldSpec;
      act(() =>
        services.data.query.filterManager.setFilters([buildExistsFilter(field, indexPattern)])
      );

      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-4`,
        }),
      });
    });
  });

  describe('saved query handling', () => {
    it('persists the saved query ID when the query is saved', async () => {
      await renderApp();

      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          savedQuery: undefined,
          onSaved: expect.any(Function),
          onSavedQueryUpdated: expect.any(Function),
          onClearSavedQuery: expect.any(Function),
        }),
        {}
      );

      const onSaved = (services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock).mock
        .calls[0][0].onSaved;
      act(() => {
        onSaved({
          id: '1',
          attributes: {
            title: '',
            description: '',
            query: { query: '', language: 'lucene' },
          },
          namespaces: ['default'],
        });
      });
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          savedQuery: {
            id: '1',
            attributes: {
              title: '',
              description: '',
              query: { query: '', language: 'lucene' },
            },
            namespaces: ['default'],
          },
        }),
        {}
      );
    });

    it('changes the saved query ID when the query is updated', async () => {
      await renderApp();
      const { onSaved, onSavedQueryUpdated } = (
        services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock
      ).mock.calls[0][0];
      act(() => {
        onSaved({
          id: '1',
          attributes: {
            title: '',
            description: '',
            query: { query: '', language: 'lucene' },
          },
          namespaces: ['default'],
        });
      });
      act(() => {
        onSavedQueryUpdated({
          id: '2',
          attributes: {
            title: 'new title',
            description: '',
            query: { query: '', language: 'lucene' },
          },
          namespaces: ['default'],
        });
      });
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          savedQuery: {
            id: '2',
            attributes: {
              title: 'new title',
              description: '',
              query: { query: '', language: 'lucene' },
            },
            namespaces: ['default'],
          },
        }),
        {}
      );
    });

    it('updates the query if saved query is selected', async () => {
      await renderApp();
      const { onSavedQueryUpdated } = (
        services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock
      ).mock.calls[0][0];
      act(() => {
        onSavedQueryUpdated({
          id: '2',
          attributes: {
            title: 'new title',
            description: '',
            query: { query: 'abc:def', language: 'lucene' },
          },
          namespaces: ['default'],
        });
      });
      expect(services.unifiedSearch.ui.AggregateQuerySearchBar).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { query: 'abc:def', language: 'lucene' },
        }),
        {}
      );
    });

    it('clears all existing unpinned filters when the active saved query is cleared', async () => {
      const { lensStore } = await renderApp();
      const { onQuerySubmit, onClearSavedQuery } = (
        services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock
      ).mock.calls[0][0];
      act(() =>
        onQuerySubmit({
          dateRange: { from: 'now-14d', to: 'now-7d' },
          query: { query: 'new', language: 'lucene' },
        })
      );
      const indexPattern = { id: 'index1', isPersisted: () => true } as unknown as DataView;
      const field = { name: 'myfield' } as unknown as FieldSpec;
      const pinnedField = { name: 'pinnedField' } as unknown as FieldSpec;
      const unpinned = buildExistsFilter(field, indexPattern);
      const pinned = buildExistsFilter(pinnedField, indexPattern);
      FilterManager.setFiltersStore([pinned], FilterStateStore.GLOBAL_STATE);
      act(() => services.data.query.filterManager.setFilters([pinned, unpinned]));
      act(() => onClearSavedQuery());
      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          filters: [pinned],
        }),
      });
    });
  });

  describe('search session id management', () => {
    it('updates the searchSessionId when the query is updated', async () => {
      const { lensStore } = await renderApp();
      const { onSaved, onSavedQueryUpdated } = (
        services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock
      ).mock.calls[0][0];
      act(() => {
        onSaved({
          id: '1',
          attributes: {
            title: '',
            description: '',
            query: { query: '', language: 'lucene' },
          },
          namespaces: ['default'],
        });
      });
      act(() => {
        onSavedQueryUpdated({
          id: '2',
          attributes: {
            title: 'new title',
            description: '',
            query: { query: '', language: 'lucene' },
          },
          namespaces: ['default'],
        });
      });
      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-2`,
        }),
      });
    });

    it('updates the searchSessionId when the active saved query is cleared', async () => {
      const { lensStore } = await renderApp();
      const { onQuerySubmit, onClearSavedQuery } = (
        services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock
      ).mock.calls[0][0];
      act(() =>
        onQuerySubmit({
          dateRange: { from: 'now-14d', to: 'now-7d' },
          query: { query: 'new', language: 'lucene' },
        })
      );
      const indexPattern = { id: 'index1', isPersisted: () => true } as unknown as DataView;
      const field = { name: 'myfield' } as unknown as FieldSpec;
      const pinnedField = { name: 'pinnedField' } as unknown as FieldSpec;
      const unpinned = buildExistsFilter(field, indexPattern);
      const pinned = buildExistsFilter(pinnedField, indexPattern);
      FilterManager.setFiltersStore([pinned], FilterStateStore.GLOBAL_STATE);
      act(() => services.data.query.filterManager.setFilters([pinned, unpinned]));
      act(() => onClearSavedQuery());
      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-4`,
        }),
      });
    });

    it('dispatches update to searchSessionId and dateRange when the user hits refresh', async () => {
      const { lensStore } = await renderApp();
      const { onQuerySubmit } = (services.unifiedSearch.ui.AggregateQuerySearchBar as jest.Mock)
        .mock.calls[0][0];
      act(() =>
        onQuerySubmit({
          dateRange: { from: 'now-7d', to: 'now' },
        })
      );
      expect(lensStore.dispatch).toHaveBeenCalledWith({
        type: 'lens/setState',
        payload: {
          resolvedDateRange: {
            fromDate: 'now-7d',
            toDate: 'now',
          },
          searchSessionId: 'sessionId-2',
        },
      });
    });

    it('updates the state if session id changes from the outside', async () => {
      const sessionIdS = new Subject<string>();
      services = makeDefaultServices(sessionIdS, 'sessionId-1');
      const { lensStore } = await renderApp();

      act(() => sessionIdS.next('new-session-id'));

      await waitToLoad();
      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `new-session-id`,
        }),
      });
    });

    it('does not update the searchSessionId when the state changes', async () => {
      const { lensStore } = await renderApp({ preloadedState: { isSaveable: true } });
      expect(lensStore.getState()).toEqual({
        lens: expect.objectContaining({
          searchSessionId: `sessionId-1`,
        }),
      });
    });
  });

  describe('showing a confirm message when leaving', () => {
    const defaultLeave = jest.fn();
    const confirmLeave = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should not show a confirm message if there is no expression to save', async () => {
      await renderApp();
      const lastCall = (props.onAppLeave as jest.Mock).mock.lastCall![0];
      lastCall({ default: defaultLeave, confirm: confirmLeave });
      expect(defaultLeave).toHaveBeenCalled();
      expect(confirmLeave).not.toHaveBeenCalled();
    });

    it('does not confirm if the user is missing save permissions', async () => {
      services.application.capabilities = {
        ...services.application.capabilities,
        visualize_v2: { save: false, show: true },
      };
      await renderApp({
        preloadedState: { isSaveable: true },
      });
      const lastCall = (props.onAppLeave as jest.Mock).mock.lastCall![0];
      lastCall({ default: defaultLeave, confirm: confirmLeave });
      expect(defaultLeave).toHaveBeenCalled();
      expect(confirmLeave).not.toHaveBeenCalled();
    });

    it('should confirm when leaving with an unsaved doc', async () => {
      await renderApp({
        preloadedState: {
          visualization: {
            activeId: 'testVis',
            state: {},
            selectedLayerId: null,
          },
          isSaveable: true,
        },
      });
      const lastCall = (props.onAppLeave as jest.Mock).mock.calls[
        (props.onAppLeave as jest.Mock).mock.calls.length - 1
      ][0];
      lastCall({ default: defaultLeave, confirm: confirmLeave });
      expect(confirmLeave).toHaveBeenCalled();
      expect(defaultLeave).not.toHaveBeenCalled();
    });

    it('should confirm when leaving with unsaved changes to an existing doc', async () => {
      await renderApp({
        preloadedState: {
          persistedDoc: getLensDocumentMock(),
          visualization: {
            activeId: 'testVis',
            state: {},
            selectedLayerId: null,
          },
          isSaveable: true,
        },
      });
      const lastCall = (props.onAppLeave as jest.Mock).mock.lastCall![0];
      lastCall({ default: defaultLeave, confirm: confirmLeave });
      expect(confirmLeave).toHaveBeenCalled();
      expect(defaultLeave).not.toHaveBeenCalled();
    });

    it('should confirm when leaving from a context initial doc with changes made in lens', async () => {
      props.contextOriginatingApp = 'TSVB';
      props.initialContext = {
        layers: [
          {
            indexPatternId: 'indexPatternId',
            chartType: 'area',
            axisPosition: 'left',
            palette: {
              type: 'palette',
              name: 'default',
            },
            metrics: [
              {
                agg: 'count',
                isFullReference: false,
                fieldName: 'document',
                params: {},
                color: '#68BC00',
              },
            ],
            timeInterval: 'auto',
          },
        ],
        type: 'lnsXY',
        savedObjectId: '',
        vizEditorOriginatingAppUrl: '#/tsvb-link',
        isVisualizeAction: true,
      } as unknown as VisualizeEditorContext;

      await renderApp({
        preloadedState: {
          persistedDoc: getLensDocumentMock(),
          visualization: {
            activeId: 'testVis',
            state: {},
            selectedLayerId: null,
          },
          isSaveable: true,
        },
      });
      const lastCall = (props.onAppLeave as jest.Mock).mock.lastCall![0];
      lastCall({ default: defaultLeave, confirm: confirmLeave });
      expect(defaultLeave).not.toHaveBeenCalled();
      expect(confirmLeave).toHaveBeenCalled();
    });

    it('should not confirm when changes are saved', async () => {
      const localDoc = getLensDocumentMock();
      const preloadedState = {
        persistedDoc: {
          ...localDoc,
          state: {
            ...localDoc.state,
            datasourceStates: {
              formBased: 'datasource',
            },
            visualization: {},
          },
        },
        isSaveable: true,
        ...(localDoc.state as Partial<LensAppState>),
        visualization: {
          activeId: 'testVis',
          state: {},
          selectedLayerId: null,
        },
      };

      await renderApp({
        preloadedState,
        datasourceMapOverride: {
          ...datasourceMap,
          formBased: {
            ...datasourceMap.formBased,
            isEqual: jest.fn().mockReturnValue(true), // if this returns false, the documents won't be accounted equal
          },
        },
      });

      const lastCallArg = props.onAppLeave.mock.lastCall![0];
      lastCallArg?.({ default: defaultLeave, confirm: confirmLeave });
      expect(defaultLeave).toHaveBeenCalled();
      expect(confirmLeave).not.toHaveBeenCalled();
    });

    it('should confirm when the latest doc is invalid', async () => {
      const { lensStore } = await renderApp();
      await act(async () => {
        await lensStore.dispatch(
          setState({
            persistedDoc: getLensDocumentMock(),
            isSaveable: true,
          })
        );
      });
      const lastCall = (props.onAppLeave as jest.Mock).mock.lastCall![0];
      lastCall({ default: defaultLeave, confirm: confirmLeave });
      expect(confirmLeave).toHaveBeenCalled();
      expect(defaultLeave).not.toHaveBeenCalled();
    });
  });

  it('should display a conflict callout if saved object conflicts', async () => {
    const history = createMemoryHistory();
    props.history = {
      ...history,
      location: {
        ...history.location,
        search: '?_g=test',
      },
    };
    await renderApp({
      preloadedState: {
        persistedDoc: getLensDocumentMock({ savedObjectId: defaultSavedObjectId }),
        sharingSavedObjectProps: {
          outcome: 'conflict',
          aliasTargetId: '2',
        },
      },
    });
    expect(services.spaces?.ui.components.getLegacyUrlConflict).toHaveBeenCalledWith({
      currentObjectId: defaultSavedObjectId,
      objectNoun: 'Lens visualization',
      otherObjectId: '2',
      otherObjectPath: '#/edit/2?_g=test',
    });
  });
});
