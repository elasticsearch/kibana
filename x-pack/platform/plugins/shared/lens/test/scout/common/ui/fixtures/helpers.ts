/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import {
  extendPlaywrightPage,
  KibanaCodeEditorWrapper,
  QueryBar,
  ContentListWrapper,
  type ApiServicesFixture,
  type KibanaUrl,
  type Locator,
  type ScoutPage,
} from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { LensPageObjects } from './page_objects';
import {
  DATA_VIEW_ID,
  FORMULA_ESCAPED_RUNTIME_FIELD,
  KBN_ARCHIVE_PATHS,
  LOGSTASH_IN_RANGE_DATES,
} from '../../fixtures/constants';
import type { ImportedSavedObject } from './saved_object_helpers';

export type PlaywrightPage = Parameters<typeof extendPlaywrightPage>[0]['page'];
/**
 * Creates an ad hoc (temporary) data view from the Lens data panel switcher.
 * Equivalent to FTR `dataViews.createFromSearchBar({ name, adHoc: true })` in the Lens context.
 */
export async function createAdHocDataViewFromLens(page: ScoutPage, name: string): Promise<void> {
  await page.testSubj.click('lns-dataView-switch-link');
  await page.testSubj.click('dataview-create-new');

  const flyout = page.testSubj.locator('indexPatternEditorFlyout');
  await flyout.waitFor({ state: 'visible' });

  const titleInput = page.testSubj.locator('createIndexPatternTitleInput');
  await titleInput.fill(name);
  await expect(titleInput).not.toHaveAttribute('aria-invalid', 'true');

  await page.testSubj.click('exploreIndexPatternButton');
  await flyout.waitFor({ state: 'hidden' });
  // Wait until the switcher reflects the new DV name
  await expect(
    page.testSubj.locator('lns-dataView-switch-link').getByTestId('fullText')
  ).toHaveText(name);
}

/**
 * Adds a new data layer to the current XY chart.
 * Equivalent to FTR `lens.createLayer('data')` for XY visualizations that show the layer-type picker.
 */
export async function addDataLayer(
  page: ScoutPage,
  seriesType: 'bar' | 'line' = 'line'
): Promise<void> {
  await page.testSubj.click('lnsLayerAddButton');
  await page.testSubj.click('lnsLayerAddButton-data');
  await page.testSubj.click(`lnsXY_seriesType-${seriesType}`);
  await page.testSubj.locator('lns-layerPanel-1').waitFor({ state: 'visible' });
}

/**
 * Creates a runtime field from the field editor flyout (Lens or Discover).
 * Caller must already open the field editor (e.g. via indexPattern-add-field).
 */
export async function createRuntimeFieldFromEditor(
  page: ScoutPage,
  fieldName: string,
  script: string
): Promise<void> {
  // Use an attribute selector (not `page.testSubj`) so this works for both a ScoutPage
  // and a plain Playwright Page (e.g. the Discover tab opened via `context.newPage()`).
  const fieldEditor = page.locator('[data-test-subj="fieldEditor"]');
  await fieldEditor.waitFor({ state: 'visible' });

  await fieldEditor.getByRole('textbox', { name: /Name/ }).fill(fieldName);
  const valueToggle = fieldEditor.getByRole('switch', { name: 'Set value' });
  await expect(valueToggle).toHaveAttribute('aria-checked', 'false');
  await valueToggle.click();

  await fieldEditor.getByRole('textbox', { name: /Editor content/ }).waitFor({ state: 'visible' });
  const codeEditor = new KibanaCodeEditorWrapper(page);
  await codeEditor.setCodeEditorValue(script);

  await fieldEditor.getByRole('button', { name: 'Save' }).click();
  await fieldEditor.waitFor({ state: 'hidden' });
}

/**
 * Opens Lens export and completes the CSV download path.
 *
 * Lens Share has two product outcomes after one Export click:
 * - auto-download when CSV is the only integration (`ELASTIC_LENS_CSV_CONTENT` with debug flag)
 * - a popover item when reporting is also registered (`exportMenuItem-CSV`)
 *
 * Waits for Export to be enabled (app signal that visualization data is present), clicks once,
 * then waits for either readiness signal and clicks the menu item at most once.
 * Dual-path handling lives here (not in the spec) for `playwright/no-conditional-in-test`.
 */
export async function completeLensCsvExport(page: ScoutPage): Promise<void> {
  const exportButton = page.testSubj.locator('lnsApp_exportButton');
  const csvMenuItem = page.testSubj.locator('exportMenuItem-CSV');

  // Readiness before click: csvEnabled / shareUrlEnabled both require hasData.
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  let shouldClickMenu = false;
  // justified: share integrations resolve asynchronously after Export opens
  await expect
    .poll(
      async () => {
        const hasContent = await page.evaluate(() => {
          const content = (
            window as Window & {
              ELASTIC_LENS_CSV_CONTENT?: Record<string, { content: string; type: string }>;
            }
          ).ELASTIC_LENS_CSV_CONTENT;
          return Boolean(content && Object.keys(content).length > 0);
        });
        if (hasContent) {
          return true;
        }
        if (await csvMenuItem.isVisible()) {
          shouldClickMenu = true;
          return true;
        }
        return false;
      },
      { timeout: 30_000 }
    )
    .toBe(true);

  if (shouldClickMenu) {
    await csvMenuItem.click();
  }

  // FTR `closeExportFlyout` — dismiss leftover export UI so the editor stays interactive.
  await page.keyboard.press('Escape');
  await expect(page.testSubj.locator('exportFlyoutCloseButton')).toBeHidden();
  await expect(page.testSubj.locator('exportPopoverPanel')).toBeHidden();
}

type LensCsvContent = Record<string, { content: string; type: string }>;

/** Reads `window.ELASTIC_LENS_CSV_CONTENT` when CSV download debug is enabled. */
export async function getLensCsvContent(page: ScoutPage): Promise<LensCsvContent | undefined> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          ELASTIC_LENS_CSV_CONTENT?: LensCsvContent;
        }
      ).ELASTIC_LENS_CSV_CONTENT
  );
}

/** Waits until CSV debug content has at least `minLayers` keys, then returns it. */
export async function waitForLensCsvContent(
  page: ScoutPage,
  minLayers: number
): Promise<LensCsvContent> {
  let content: LensCsvContent | undefined;
  await expect
    .poll(async () => {
      content = await getLensCsvContent(page);
      return content && Object.keys(content).length >= minLayers;
    })
    .toBe(true);
  if (!content) {
    throw new Error(`Expected at least ${minLayers} CSV layer(s)`);
  }
  return content;
}

/**
 * Opens a Lens share URL in a new tab and waits for the app + chart to mount.
 * Caller must close the returned page (use `try`/`finally`).
 */
export async function openSharedLensUrl(options: {
  context: { newPage: () => Promise<PlaywrightPage> };
  kbnUrl: KibanaUrl;
  url: string;
  chartTestSubj?: string;
}): Promise<{ page: ScoutPage; queryBar: QueryBar }> {
  const { context, kbnUrl, url, chartTestSubj = 'xyVisChart' } = options;
  const sharedPage = extendPlaywrightPage({
    page: await context.newPage(),
    kbnUrl,
  });
  await sharedPage.goto(url);
  await sharedPage.testSubj.locator('lnsApp').waitFor({ state: 'visible' });
  await sharedPage
    .locator(`[data-test-subj="lnsWorkspace"] [data-test-subj="${chartTestSubj}"]`)
    .waitFor({ state: 'visible' });
  return { page: sharedPage, queryBar: new QueryBar(sharedPage) };
}

// Uses Lens-editor-only methods (e.g. `inlineEditor`, `convertToEsqlButton`), so this is
// typed against the Lens plugin's rich page object, not the shared `@kbn/scout` `PageObjects`.
type DashboardAndLens = Pick<LensPageObjects, 'dashboard' | 'lens'>;
type VisualizeAndLens = Pick<LensPageObjects, 'visualize' | 'lens'>;

/**
 * Builds a fresh Lens Metric visualization directly from the editor UI, with a primary and a
 * secondary "Average of bytes" dimension. Used instead of the FTR-only `lens` service's
 * `createMetricChart` API helper, so metric specs stay self-contained.
 */
export async function buildMetricVisualization({ visualize, lens }: VisualizeAndLens) {
  await visualize.goto();
  await visualize.openNewVisualizationWizard();
  await visualize.clickVisType('lens');
  await lens.switchToVisualization('lnsMetric', { search: 'Metric' });

  await lens.configureDimension({
    dimension: 'lnsMetric_primaryMetricDimensionPanel > lns-empty-dimension',
    operation: 'average',
    field: 'bytes',
  });
  await lens.configureDimension({
    dimension: 'lnsMetric_secondaryMetricDimensionPanel > lns-empty-dimension',
    operation: 'average',
    field: 'bytes',
  });
}

interface LogstashSpaceSetupContext {
  scoutSpace: {
    id: string;
    uiSettings: {
      set: (values: Record<string, string>) => Promise<void>;
      unset: (...keys: string[]) => Promise<unknown>;
    };
    savedObjects: {
      load: (path: string) => Promise<Array<{ id: string; type: string; title: string }>>;
      cleanStandardList: () => Promise<void>;
    };
  };
  apiServices: {
    dataViews: {
      create: (body: {
        title: string;
        name: string;
        timeFieldName: string;
        spaceId: string;
        runtimeFieldMap?: Record<string, { type: string; script: { source: string } }>;
      }) => Promise<{ data: { id?: string } }>;
      update: (
        id: string,
        body: {
          runtimeFieldMap?: Record<string, { type: string; script: { source: string } }>;
          spaceId: string;
        }
      ) => Promise<unknown>;
      delete: (id: string, spaceId: string) => Promise<unknown>;
    };
  };
}

export interface ElasticChartDebugContext {
  addInitScript: (script: () => void) => Promise<{ dispose: () => Promise<void> }>;
}

interface LogstashLensEditorBeforeEachContext {
  browserAuth: { loginAsPrivilegedUser: () => Promise<void> };
  context: ElasticChartDebugContext;
  page: { setViewportSize: (size: { width: number; height: number }) => Promise<void> };
  pageObjects: Pick<LensPageObjects, 'visualize' | 'lens'>;
}

/** Matches FTR lens group5 `browser.setWindowSize(1280, 1200)`. */
export const LENS_EDITOR_VIEWPORT = { width: 1280, height: 1200 } as const;

/** Enables elastic-charts debug state for subsequent page loads in this browser context. */
export async function enableElasticChartDebug(context: ElasticChartDebugContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { _echDebugStateFlag?: boolean })._echDebugStateFlag = true;
  });
}

/**
 * Creates a space-scoped Logstash data view + common uiSettings so Visualize/Lens
 * do not redirect to the "no data views" empty state.
 * Returns `beforeEach` that logs in and opens an empty Lens editor with `_g` time
 * already in the URL (same shape as `createOpenInLensSuiteSetup`).
 */
export function createLogstashLensEditorSuiteSetup(options?: {
  timeRange?: { from: string; to: string };
  /** When true, enables elastic-charts debug state before navigating to Lens. */
  enableChartDebug?: boolean;
  /**
   * When true, loads FTR `lens_basic` archive into the space
   * (needed to open saved `lnsXYvis` for formula transition coverage).
   * Does not load `default.json` — that only adds `lnsTableVis` / a duplicate index-pattern.
   */
  loadLensArchives?: boolean;
  /** When true, adds the escaped-name runtime field used by formula KQL field escaping. */
  withEscapedRuntimeField?: boolean;
  /**
   * When true, skips opening an empty Lens editor in `beforeEach`
   * (for specs that open a saved visualization immediately).
   */
  skipEmptyLensOpen?: boolean;
}) {
  const timeRange = options?.timeRange ?? LOGSTASH_IN_RANGE_DATES;
  const enableChartDebug = options?.enableChartDebug ?? false;
  const loadLensArchives = options?.loadLensArchives ?? false;
  const withEscapedRuntimeField = options?.withEscapedRuntimeField ?? false;
  const skipEmptyLensOpen = options?.skipEmptyLensOpen ?? false;
  let storedDataViewId: string | undefined;

  const beforeAll = async ({
    scoutSpace,
    apiServices,
  }: LogstashSpaceSetupContext): Promise<ImportedSavedObject[]> => {
    const importedSavedObjects = loadLensArchives
      ? await scoutSpace.savedObjects.load(KBN_ARCHIVE_PATHS.LENS_BASIC)
      : [];

    // Name matches title so Lens data-view switcher rows resolve as `dataView-logstash-*`.
    const { data: dataView } = await apiServices.dataViews.create({
      title: DATA_VIEW_ID.LOGSTASH,
      name: DATA_VIEW_ID.LOGSTASH,
      timeFieldName: '@timestamp',
      spaceId: scoutSpace.id,
      ...(withEscapedRuntimeField
        ? {
            runtimeFieldMap: {
              [FORMULA_ESCAPED_RUNTIME_FIELD]: {
                type: 'keyword',
                script: { source: "emit('abc')" },
              },
            },
          }
        : {}),
    });
    storedDataViewId = dataView.id;

    await scoutSpace.uiSettings.set({
      defaultIndex: storedDataViewId ?? DATA_VIEW_ID.LOGSTASH,
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': JSON.stringify({
        from: timeRange.from,
        to: timeRange.to,
      }),
    });

    return importedSavedObjects;
  };

  const beforeEach = async ({
    browserAuth,
    context,
    page,
    pageObjects,
  }: LogstashLensEditorBeforeEachContext) => {
    await page.setViewportSize(LENS_EDITOR_VIEWPORT);
    if (enableChartDebug) {
      await enableElasticChartDebug(context);
    }
    await browserAuth.loginAsPrivilegedUser();
    if (skipEmptyLensOpen) {
      return;
    }
    await openEmptyLensEditor(pageObjects, { timeRange });
  };

  const afterAll = async ({ scoutSpace, apiServices }: LogstashSpaceSetupContext) => {
    if (storedDataViewId) {
      await apiServices.dataViews.delete(storedDataViewId, scoutSpace.id);
    }
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  };

  const openEmptyLensEditorForSuite = async (
    pageObjects: Pick<LensPageObjects, 'lens'>
  ): Promise<void> => {
    await openEmptyLensEditor(pageObjects, { timeRange });
  };

  const getDataViewId = (): string => {
    if (!storedDataViewId) {
      throw new Error('Logstash data view has not been created');
    }
    return storedDataViewId;
  };

  return {
    beforeAll,
    beforeEach,
    afterAll,
    openEmptyLensEditor: openEmptyLensEditorForSuite,
    getDataViewId,
  };
}

/** Creates a dashboard whose first panel is a library-linked Lens visualization. */
export async function createDashboardWithLibraryLensPanel(
  apiServices: Pick<ApiServicesFixture, 'dashboard'>,
  spaceId: string,
  params: { dashboardTitle: string; lensSavedObjectId: string }
): Promise<string> {
  return apiServices.dashboard.create(
    {
      title: params.dashboardTitle,
      time_range: LOGSTASH_IN_RANGE_DATES,
      panels: [
        {
          type: LENS_EMBEDDABLE_TYPE,
          grid: { x: 0, y: 0, w: 24, h: 15 },
          config: { ref_id: params.lensSavedObjectId },
        },
      ],
    },
    spaceId
  );
}

/**
 * Clicks the Elastic Charts canvas at an offset from the canvas **center**.
 * Matches FTR WebDriver `move({ x, y, origin: canvas })` (center-relative), not
 * Playwright's default top-left `position`. Coordinates match FTR lens/group4
 * dashboard chart clicks at viewport {@link LENS_EDITOR_VIEWPORT}.
 */
export async function clickElasticChartCanvas(
  page: ScoutPage,
  offset: { x: number; y: number },
  options?: { button?: 'left' | 'right' }
): Promise<void> {
  const canvas = page.locator('.echChart canvas:last-of-type');
  await canvas.waitFor({ state: 'visible' });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Elastic Charts canvas has no bounding box');
  }
  await canvas.click({
    button: options?.button ?? 'left',
    position: {
      x: box.width / 2 + offset.x,
      y: box.height / 2 + offset.y,
    },
  });
}

/**
 * Opens a fresh empty Lens editor with `_g` time already in the URL hash.
 * Defaults to {@link LOGSTASH_IN_RANGE_DATES}. Pass `timeRange` when the suite uses a
 * different window — sync will not replace an existing `_g` from uiSettings.
 */
export async function openEmptyLensEditor(
  pageObjects: Pick<LensPageObjects, 'lens'>,
  options?: { timeRange?: { from: string; to: string } }
): Promise<void> {
  await pageObjects.lens.workspace.openEmptyEditor(options?.timeRange ?? LOGSTASH_IN_RANGE_DATES);
}

export async function openDimensionEditorAndWaitForFlyout(
  { lens }: DashboardAndLens,
  page: ScoutPage,
  dimensionPanel: Locator
) {
  const dimensionButton = dimensionPanel.getByRole('button', { name: /Edit .* configuration/ });
  await dimensionButton.click();

  // Confirm that the secondary flyout is opened
  await expect(lens.workspace.secondaryFlyoutBackButton).toBeVisible();
  await expect(page.getByTestId('text-based-languages-field-selection-row')).toBeVisible();
}

/**
 * Opens the Lens inline editor for a panel via its hover/context action and waits for the
 * flyout. Complements {@link openInlineEditorAndWaitVisible} for panels without a known
 * embeddable id (e.g. freshly created, unsaved panels).
 */
export async function openPanelInlineEditorAndWaitVisible(
  { dashboard, lens }: DashboardAndLens,
  panelTitle?: string
) {
  await dashboard.clickPanelAction('embeddablePanelAction-editPanel', panelTitle);
  await expect(lens.workspace.inlineEditor).toBeVisible();
}

export async function openInlineEditorAndWaitVisible(
  { dashboard, lens }: DashboardAndLens,
  panelId: string
) {
  await dashboard.openInlineEditor(panelId);
  await expect(lens.workspace.inlineEditor).toBeVisible();
}

export async function applyLensInlineEditorAndWaitClosed({ lens }: Pick<LensPageObjects, 'lens'>) {
  await lens.applyFlyoutButton.click();
  await expect(lens.workspace.inlineEditor).toBeHidden();
}

export async function cancelLensInlineEditorAndWaitClosed({ lens }: Pick<LensPageObjects, 'lens'>) {
  await lens.cancelFlyoutButton.click();
  await expect(lens.workspace.inlineEditor).toBeHidden();
}

/**
 * Deletes an annotation group saved object from the Visualize "Annotation library" tab, by
 * title. Navigates directly to the tab via URL hash rather than clicking through the
 * Visualize landing page's tab bar, which has no stable per-tab test subject.
 */
export async function deleteAnnotationGroupFromLibrary(page: ScoutPage, title: string) {
  await page.gotoApp('visualize', { hash: '/annotations' });
  const contentList = new ContentListWrapper(page);
  await contentList.searchBox.waitFor({ state: 'visible' });
  await contentList.searchFor(title);
  await contentList.selectAllAndDelete();
}

export async function convertToEsqlViaModal({
  pageObjects,
  page,
}: {
  pageObjects: DashboardAndLens;
  page: ScoutPage;
}) {
  const { lens } = pageObjects;

  // Click on the "Conver to ES|QL" button in the in-line editor
  await lens.workspace.convertToEsqlButton.click();

  // Click on the confirmation button in the modal
  const modal = lens.workspace.convertToEsqlModal;
  await lens.workspace.convertToEsqlModalConfirmButton.click();
  await expect(modal).toBeHidden();

  // Confirm that the in-line editor has been updated
  await expect(lens.workspace.convertToEsqlButton).toBeHidden();
  await expect(page.getByTestId('ESQLEditor')).toBeVisible();
  await expect(page.getByText('ES|QL Query Results')).toBeVisible();
}

/**
 * Builds a new legacy-metric Lens vis (average of bytes).
 * Opens the Lens editor directly — the Visualize listing bootstrap is not under test.
 */
export async function createNewLens({ lens }: Pick<LensPageObjects, 'lens'>): Promise<void> {
  await openEmptyLensEditor({ lens });
  await lens.configureDimension({
    dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
    operation: 'average',
    field: 'bytes',
  });
  await lens.switchToVisualization('lnsLegacyMetric', { search: 'legacy' });
  await lens.waitForVisualization('legacyMtrVis');
}
