/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { setComboBoxValue } from '../combo_box_helpers';
import { RANDOM_SAMPLER_OPTION_VALUES, type RandomSamplerOption } from '../random_sampler';

export type DataDriftRandomSamplerOption = RandomSamplerOption;

type SubjectId = 'reference' | 'comparison';

export class DataDrift {
  private readonly dataSourceSelectorButton: Locator;
  private readonly timeRangeSelectorSection: Locator;
  private readonly useFullDataButton: Locator;
  private readonly applyTimeButton: Locator;
  private readonly queryInput: Locator;
  private readonly dataDriftTable: Locator;
  private readonly runAnalysisButton: Locator;
  private readonly analyzeWithoutSavingButton: Locator;
  private readonly analyzeDataDriftButton: Locator;
  private readonly customIndexPatternsPage: Locator;
  private readonly noWindowParametersEmptyPrompt: Locator;
  private readonly changeDataViewPopover: Locator;
  private readonly createDataViewNameInput: Locator;
  private readonly createDataViewTitleInput: Locator;
  private readonly saveIndexPatternButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.dataSourceSelectorButton = this.page.testSubj.locator('mlDataSourceSelectorButton');
    this.timeRangeSelectorSection = this.page.testSubj.locator(
      'dataComparisonTimeRangeSelectorSection'
    );
    this.useFullDataButton = this.page.testSubj.locator('mlDatePickerButtonUseFullData');
    this.applyTimeButton = this.page.testSubj.locator('superDatePickerApplyTimeButton');
    this.queryInput = this.page.testSubj.locator('dataVisualizerQueryInput');
    this.dataDriftTable = this.page.testSubj.locator('mlDataDriftTable');
    this.runAnalysisButton = this.page.testSubj.locator('runDataDriftAnalysis');
    this.analyzeWithoutSavingButton = this.page.testSubj.locator(
      'analyzeDataDriftWithoutSavingButton'
    );
    this.analyzeDataDriftButton = this.page.testSubj.locator('analyzeDataDriftButton');
    this.customIndexPatternsPage = this.page.testSubj.locator('mlPageDataDriftCustomIndexPatterns');
    this.noWindowParametersEmptyPrompt = this.page.testSubj.locator(
      'dataDriftNoWindowParametersEmptyPrompt'
    );
    this.changeDataViewPopover = this.page.testSubj.locator('changeDataViewPopover');
    this.createDataViewNameInput = this.page.testSubj.locator('createIndexPatternNameInput');
    this.createDataViewTitleInput = this.page.testSubj.locator('createIndexPatternTitleInput');
    this.saveIndexPatternButton = this.page.testSubj.locator('saveIndexPatternButton');
  }

  getDataTestSubject(testSubject: string, id?: string) {
    return id ? `${testSubject}-${id}` : testSubject;
  }

  async waitForDataViewTitle(expectedTitle: string) {
    await this.dataSourceSelectorButton.waitFor({ state: 'visible' });
    await expect(this.dataSourceSelectorButton).toHaveAccessibleName(expectedTitle, {
      timeout: 5000,
    });
  }

  async waitForDataViewTitleIfNeeded(dataViewName?: string) {
    if (dataViewName === undefined) {
      return;
    }

    await this.waitForDataViewTitle(dataViewName);
  }

  async waitForTimeRangeSelectorSection() {
    await this.timeRangeSelectorSection.waitFor({ state: 'visible' });
  }

  async waitForTotalDocumentCount(
    id: 'Reference' | 'Comparison',
    expectedFormattedTotalDocCount: string,
    timeout = 30_000
  ) {
    await expect(this.page.testSubj.locator(`dataVisualizerTotalDocCount-${id}`)).toHaveText(
      expectedFormattedTotalDocCount,
      { timeout }
    );
  }

  randomSamplerOptionsButton(id: string) {
    return this.page.testSubj.locator(
      this.getDataTestSubject('aiopsRandomSamplerOptionsButton', id)
    );
  }

  async waitForNoWindowParametersEmptyPrompt() {
    await this.noWindowParametersEmptyPrompt.waitFor({ state: 'visible', timeout: 5000 });
  }

  async waitForRandomSamplingOption(
    id: string,
    expectedOption: DataDriftRandomSamplerOption,
    expectedProbability?: number,
    timeout = 20_000
  ) {
    await this.page.keyboard.press('Escape');
    await this.randomSamplerOptionsButton(id).click();
    await this.page.testSubj
      .locator(this.getDataTestSubject('aiopsRandomSamplerOptionsPopover', id))
      .waitFor({ state: 'visible' });

    if (expectedOption === 'dvRandomSamplerOptionOff') {
      await this.page.testSubj
        .locator('dvRandomSamplerProbabilityRange')
        .waitFor({ state: 'hidden' });
      await this.page.testSubj
        .locator('dvRandomSamplerProbabilityUsedMsg')
        .waitFor({ state: 'hidden' });
    }

    if (expectedOption === 'dvRandomSamplerOptionOnManual') {
      await this.page.testSubj
        .locator('dvRandomSamplerProbabilityRange')
        .waitFor({ state: 'visible' });

      if (expectedProbability !== undefined) {
        await expect(this.page.testSubj.locator('dvRandomSamplerProbabilityRange')).toHaveValue(
          `${expectedProbability}`,
          { timeout }
        );
      }
    }

    if (expectedOption === 'dvRandomSamplerOptionOnAutomatic') {
      await this.page.testSubj
        .locator('dvRandomSamplerProbabilityUsedMsg')
        .waitFor({ state: 'visible' });

      if (expectedProbability !== undefined) {
        await expect(this.page.testSubj.locator('dvRandomSamplerProbabilityUsedMsg')).toContainText(
          `${expectedProbability}`,
          { timeout }
        );
      }
    }
  }

  async setRandomSamplingOption(id: string, option: DataDriftRandomSamplerOption) {
    await this.page.keyboard.press('Escape');
    await this.randomSamplerOptionsButton(id).waitFor({ state: 'visible' });
    await this.randomSamplerOptionsButton(id).click();
    await this.page.testSubj
      .locator(this.getDataTestSubject('aiopsRandomSamplerOptionsPopover', id))
      .waitFor({ state: 'visible', timeout: 1000 });
    await this.page.testSubj
      .locator(this.getDataTestSubject('aiopsRandomSamplerOptionsSelect', id))
      .selectOption(RANDOM_SAMPLER_OPTION_VALUES[option]);
    await this.page.keyboard.press('Escape');
  }

  async clickUseFullDataButton() {
    await expect(this.useFullDataButton).toBeEnabled({ timeout: 30_000 });
    await this.useFullDataButton.click();
    await expect(this.applyTimeButton).toBeVisible({ timeout: 10_000 });
    await this.applyTimeButton.click();
  }

  async waitForPrimarySearchBar() {
    await this.queryInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  async waitForDocCountContent(id: string) {
    await this.page.testSubj
      .locator(this.getDataTestSubject('dataDriftTotalDocCountHeader', id))
      .waitFor({ state: 'visible', timeout: 5000 });
    await this.page.testSubj
      .locator(this.getDataTestSubject('dataDriftDocCountChart', id))
      .waitFor({ state: 'visible', timeout: 5000 });
  }

  async waitForReferenceDocCountContent() {
    await this.waitForDocCountContent('Reference');
  }

  async waitForComparisonDocCountContent() {
    await this.waitForDocCountContent('Comparison');
  }

  async waitForHistogramBrushes(id: 'Reference' | 'Comparison' = 'Reference') {
    await this.page.testSubj
      .locator(`dataDriftBrush-${id}`)
      .waitFor({ state: 'attached', timeout: 30_000 });
  }

  async clickDocumentCountChart(
    id: 'Reference' | 'Comparison',
    chartClickCoordinates: [number, number]
  ) {
    const chart = this.page.testSubj.locator(`dataDriftDocCountChart-${id}`);
    await chart.waitFor({ state: 'visible', timeout: 30_000 });
    await chart
      .locator('.echChartStatus[data-ech-render-complete="true"]')
      .waitFor({ state: 'attached', timeout: 30_000 });

    // FTR `elasticChart.getCanvas(testSubj)` returns `.echCanvasRenderer` and clicks
    // with WebDriver Actions using the element center as origin ([0, 0] = center).
    const renderer = chart.locator('.echCanvasRenderer');
    await renderer.waitFor({ state: 'visible', timeout: 30_000 });
    const box = await renderer.boundingBox();

    if (!box) {
      throw new Error(`Chart dataDriftDocCountChart-${id} has no bounding box`);
    }

    const [offsetX, offsetY] = chartClickCoordinates;
    await this.page.mouse.click(box.x + box.width / 2 + offsetX, box.y + box.height / 2 + offsetY);

    await this.page.testSubj
      .locator(`dataDriftBrush-${id}`)
      .waitFor({ state: 'attached', timeout: 30_000 });
  }

  async waitForDataDriftTable() {
    await this.dataDriftTable.waitFor({ state: 'visible' });
  }

  isRunAnalysisButtonDisabled() {
    return this.runAnalysisButton.isDisabled();
  }

  async runAnalysis() {
    await this.runAnalysisButton.click();
    await this.waitForDataDriftTable();
  }

  async navigateToCreateNewDataViewPage() {
    await this.page.gotoApp('ml/data_drift_custom');
    await this.customIndexPatternsPage.waitFor({ state: 'visible', timeout: 10_000 });
  }

  indexPatternFormRow(id: SubjectId) {
    return this.page.testSubj.locator(`mlDataDriftIndexPatternFormRow-${id}`);
  }

  async waitForIndexPatternNotEmptyFormError(id: SubjectId) {
    const row = this.indexPatternFormRow(id);
    await row.waitFor({ state: 'visible', timeout: 5000 });
    await row.locator('.euiFormErrorText').waitFor({ state: 'visible' });
  }

  indexPatternInput(id: SubjectId) {
    return this.page.testSubj.locator(`mlDataDriftIndexPatternTitleInput-${id}`);
  }

  async waitForIndexPatternInput(id: SubjectId, expectedText: string) {
    await expect(this.indexPatternInput(id)).toHaveValue(expectedText, { timeout: 5000 });
  }

  async setIndexPatternInput(id: SubjectId, pattern: string) {
    const input = this.indexPatternInput(id);
    await input.waitFor({ state: 'visible' });

    // This controlled field auto-appends "*" after the first character. Type without a
    // trailing wildcard (same as FTR) so that matches user input. pressSequentially fires
    // real key events so React state updates; fill()/insertText can set the DOM value
    // without onChange, then a re-render clears the field.
    const hasWildcard = pattern.endsWith('*');
    const trimmedPattern = hasWildcard ? pattern.slice(0, -1) : pattern;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await input.click();
      await this.page.keyboard.press('ControlOrMeta+A');
      await this.page.keyboard.press('Backspace');

      if (trimmedPattern.length > 0) {
        await input.pressSequentially(trimmedPattern[0]);
        await expect(input).toHaveValue(`${trimmedPattern[0]}*`);
        if (trimmedPattern.length > 1) {
          await input.pressSequentially(trimmedPattern.slice(1));
        }
      }

      if (!hasWildcard) {
        await input.press('Delete');
      }

      try {
        await this.waitForIndexPatternInput(id, pattern);
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
      }
    }
  }

  async waitForAnalyzeWithoutSavingButtonHidden() {
    await this.analyzeWithoutSavingButton.waitFor({ state: 'hidden', timeout: 5000 });
  }

  isAnalyzeWithoutSavingButtonDisabled() {
    return this.analyzeWithoutSavingButton.isDisabled();
  }

  isAnalyzeDataDriftButtonDisabled() {
    return this.analyzeDataDriftButton.isDisabled();
  }

  async clickAnalyzeWithoutSavingButton() {
    await this.analyzeWithoutSavingButton.waitFor({ state: 'visible', timeout: 5000 });
    await this.analyzeWithoutSavingButton.click();
    await this.customIndexPatternsPage.waitFor({ state: 'visible', timeout: 5000 });
  }

  async clickAnalyzeDataDrift() {
    await this.analyzeDataDriftButton.waitFor({ state: 'visible', timeout: 5000 });
    await this.analyzeDataDriftButton.click();
    await this.customIndexPatternsPage.waitFor({ state: 'visible', timeout: 5000 });
  }

  async waitForDataDriftTimestampField(expectedIdentifier: string) {
    // Combo box uses singleSelection.asPlainText — value is in the input, not a pill.
    const comboBox = this.page.components.comboBox('mlDataDriftTimestampField');
    await expect
      .poll(async () => {
        if (expectedIdentifier === '') {
          return (await comboBox.getSelectedOptions()).length === 0;
        }
        return (await comboBox.getSelectedOptions()).includes(expectedIdentifier);
      })
      .toBe(true);
  }

  async selectTimeField(timeFieldName: string) {
    const timestampFieldWrapper = this.page.testSubj.locator('mlDataDriftTimestampField');
    await timestampFieldWrapper.waitFor({ state: 'visible', timeout: 30_000 });
    await expect(timestampFieldWrapper).not.toHaveClass(/euiComboBox-isDisabled/, {
      timeout: 10_000,
    });
    await setComboBoxValue(this.page, 'mlDataDriftTimestampField', timeFieldName, {
      optionVisibilityTimeoutMs: 30_000,
    });
    await this.waitForDataDriftTimestampField(timeFieldName);
  }

  async openDataViewPicker() {
    await this.dataSourceSelectorButton.click();
    await this.changeDataViewPopover.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async openCreateDataViewFromPicker() {
    await this.openDataViewPicker();
    await this.page.testSubj.locator('dataview-create-new').click();
  }

  async createDataViewViaFlyout({
    name,
    indexPattern,
    timeField,
  }: {
    name: string;
    indexPattern: string;
    timeField?: string;
  }) {
    await this.createDataViewNameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.createDataViewNameInput.fill(name);
    await this.createDataViewTitleInput.fill(indexPattern);

    if (timeField) {
      await this.page.testSubj.locator('toggleAdvancedSetting').click();
      await this.page.testSubj.locator('allowHiddenField').waitFor({ state: 'visible' });

      const timestampFieldWrapper = this.page.testSubj.locator('timestampField');
      await timestampFieldWrapper.waitFor({ state: 'visible' });
      await expect
        .poll(async () => {
          const className = await timestampFieldWrapper.getAttribute('class');
          return !className?.includes('euiComboBox-isDisabled');
        })
        .toBe(true);
      await setComboBoxValue(this.page, 'timestampField', timeField, {
        optionVisibilityTimeoutMs: 10_000,
      });
    }

    await this.saveIndexPatternButton.click();
    await this.createDataViewNameInput.waitFor({ state: 'hidden', timeout: 10_000 });
  }
}
