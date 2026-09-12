/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, cleanup, act, fireEvent, getByTestId, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import type { TrustedAppEntryTypes } from '@kbn/securitysolution-utils';
import {
  CONTROL_CHARACTER_ERROR,
  OperatingSystem,
  ConditionEntryField,
} from '@kbn/securitysolution-utils';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { stubIndexPattern } from '@kbn/data-plugin/common/stubs';
import { useFetchIndex } from '../../../../../common/containers/source';
import { TrustedAppsForm, validateValues } from './form'; // validateValues is tested in its own describe block below
import type {
  ArtifactFormComponentOnChangeCallbackProps,
  ArtifactFormComponentProps,
} from '../../../../components/artifact_list_page';
import type { AppContextTestRender } from '../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../common/mock/endpoint';
import {
  INPUT_ERRORS,
  USING_ADVANCED_MODE,
  USING_ADVANCED_MODE_DESCRIPTION,
} from '../translations';
import { licenseService } from '../../../../../common/hooks/use_license';
import { forceHTMLElementOffsetWidth } from '../../../../components/effected_policy_select/test_utils';
import type { TrustedAppConditionEntry } from '../../../../../../common/endpoint/types';
import type { IHttpFetchError } from '@kbn/core-http-browser';
import { TRUSTED_PROCESS_DESCENDANTS_TAG } from '../../../../../../common/endpoint/service/artifacts/constants';

jest.mock('../../../../../common/components/user_privileges');
jest.mock('../../../../../common/containers/source');
jest.mock('../../../../../common/hooks/use_license', () => {
  const licenseServiceInstance = {
    isPlatinumPlus: jest.fn(),
  };
  return {
    licenseService: licenseServiceInstance,
    useLicense: () => {
      return licenseServiceInstance;
    },
  };
});

describe('Trusted apps form', () => {
  const formPrefix = 'trustedApps-form';
  let resetHTMLElementOffsetWidth: ReturnType<typeof forceHTMLElementOffsetWidth>;

  let formProps: jest.Mocked<ArtifactFormComponentProps>;
  let mockedContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let latestUpdatedItem: ArtifactFormComponentProps['item'];

  const getUI = () => <TrustedAppsForm {...formProps} />;
  const render = () => {
    return (renderResult = mockedContext.render(getUI()));
  };
  const rerender = () => renderResult.rerender(getUI());
  const rerenderWithLatestProps = () => {
    formProps.item = latestUpdatedItem;
    rerender();
  };

  function createEntry<T extends ConditionEntryField = ConditionEntryField>(
    field: T,
    type: TrustedAppEntryTypes,
    value: string
  ): TrustedAppConditionEntry {
    return {
      field,
      type,
      operator: 'included',
      value,
    };
  }

  function createItem(
    overrides: Partial<ArtifactFormComponentProps['item']> = {}
  ): ArtifactFormComponentProps['item'] {
    const defaults: ArtifactFormComponentProps['item'] = {
      list_id: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
      name: '',
      description: '',
      os_types: [OperatingSystem.WINDOWS],
      entries: [createEntry(ConditionEntryField.HASH, 'match', '')],
      type: 'simple',
      tags: ['policy:all'],
      meta: { temporaryUuid: '1111' },
    };
    return {
      ...defaults,
      ...overrides,
    };
  }

  function createOnChangeArgs(
    overrides: Partial<ArtifactFormComponentOnChangeCallbackProps>
  ): ArtifactFormComponentOnChangeCallbackProps {
    const defaults = {
      item: createItem(),
      isValid: false,
    };
    return {
      ...defaults,
      ...overrides,
    };
  }

  // Some helpers
  const setTextFieldValue = (textField: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    act(() => {
      fireEvent.change(textField, {
        target: { value },
      });
      fireEvent.blur(textField);
    });
  };
  const getDetailsBlurb = (dataTestSub: string = formPrefix): HTMLInputElement => {
    return renderResult.queryByTestId(`${dataTestSub}-about`) as HTMLInputElement;
  };
  const getNameField = (dataTestSub: string = formPrefix): HTMLInputElement => {
    return renderResult.getByTestId(`${dataTestSub}-nameTextField`) as HTMLInputElement;
  };
  const getOsField = (dataTestSub: string = formPrefix): HTMLButtonElement => {
    return renderResult.getByTestId(`${dataTestSub}-osSelectField`) as HTMLButtonElement;
  };
  const getDescriptionField = (dataTestSub: string = formPrefix): HTMLTextAreaElement => {
    return renderResult.getByTestId(`${dataTestSub}-descriptionField`) as HTMLTextAreaElement;
  };
  const getCondition = (index: number = 0, dataTestSub: string = formPrefix): HTMLElement => {
    return renderResult.getByTestId(`${dataTestSub}-conditionsBuilder-group1-entry${index}`);
  };
  const getAllConditions = (dataTestSub: string = formPrefix): HTMLElement[] => {
    return Array.from(
      renderResult.getByTestId(`${dataTestSub}-conditionsBuilder-group1-entries`).children
    ) as HTMLElement[];
  };
  const getConditionRemoveButton = (condition: HTMLElement): HTMLButtonElement => {
    return getByTestId(condition, `${condition.dataset.testSubj}-remove`) as HTMLButtonElement;
  };
  const getConditionFieldSelect = (condition: HTMLElement): HTMLButtonElement => {
    return getByTestId(condition, `${condition.dataset.testSubj}-field`) as HTMLButtonElement;
  };

  const getConditionValue = (condition: HTMLElement): HTMLInputElement => {
    return getByTestId(condition, `${condition.dataset.testSubj}-value`) as HTMLInputElement;
  };
  const getConditionBuilderAndButton = (dataTestSub: string = formPrefix): HTMLButtonElement => {
    return renderResult.getByTestId(
      `${dataTestSub}-conditionsBuilder-group1-AndButton`
    ) as HTMLButtonElement;
  };
  const getConditionBuilderAndConnectorBadge = (dataTestSub: string = formPrefix): HTMLElement => {
    return renderResult.getByTestId(`${dataTestSub}-conditionsBuilder-group1-andConnector`);
  };
  const getAllValidationErrors = (): HTMLElement[] => {
    return Array.from(
      renderResult.container.querySelectorAll('.euiFormErrorText, [data-test-subj$="-valueError"]')
    );
  };
  const getAllValidationWarnings = (): HTMLElement[] => {
    return Array.from(
      renderResult.container.querySelectorAll('.euiFormHelpText, [data-test-subj$="-valueWarning"]')
    );
  };

  const getAdvancedModeToggle = (): HTMLButtonElement => {
    return renderResult.getByTestId(`advancedModeButton`) as HTMLButtonElement;
  };

  const getBasicModeToggle = (): HTMLButtonElement => {
    return renderResult.getByTestId(`basicModeButton`) as HTMLButtonElement;
  };

  const getAdvancedModeUsageWarningHeader = (dataTestSub: string = formPrefix): HTMLElement => {
    return renderResult.getByTestId(`${dataTestSub}-advancedModeUsageWarningHeader`);
  };

  const getAdvancedModeUsageWarningBody = (dataTestSub: string = formPrefix): HTMLElement => {
    return renderResult.getByTestId(`${dataTestSub}-advancedModeUsageWarningBody`);
  };

  const expectReactNodeContainingMessage = (substring: string) =>
    expect.objectContaining({
      props: expect.objectContaining({
        defaultMessage: expect.stringContaining(substring),
      }),
    });

  beforeEach(() => {
    resetHTMLElementOffsetWidth = forceHTMLElementOffsetWidth();
    (licenseService.isPlatinumPlus as jest.Mock).mockReturnValue(true);
    mockedContext = createAppRootMockRenderer();
    mockedContext.setExperimentalFlag({ trustedAppsAdvancedMode: true });
    latestUpdatedItem = createItem();
    (useFetchIndex as jest.Mock).mockImplementation(() => [
      false,
      {
        indexPatterns: stubIndexPattern,
      },
    ]);

    formProps = {
      item: latestUpdatedItem,
      mode: 'create',
      disabled: false,
      error: undefined,
      onChange: jest.fn((updates) => {
        latestUpdatedItem = updates.item;
      }),
    };
  });

  afterEach(() => {
    resetHTMLElementOffsetWidth();
    cleanup();
  });

  it('should display form submission errors', () => {
    const message = 'oh oh - failed';
    formProps.error = new Error(message) as IHttpFetchError;
    render();

    expect(renderResult.getByTestId(`${formPrefix}-submitError`).textContent).toMatch(message);
  });

  describe('Details and Conditions', () => {
    beforeEach(() => render());

    it('should NOT initially show any inline validation errors', () => {
      expect(renderResult.container.querySelectorAll('.euiFormErrorText').length).toBe(0);
    });

    it('should hide details text when in edit mode', () => {
      formProps.mode = 'edit';
      rerenderWithLatestProps();
      expect(getDetailsBlurb()).toBeNull();
    });

    it('should show name required name blur', () => {
      setTextFieldValue(getNameField(), '  ');
      expect(renderResult.getByText(INPUT_ERRORS.name)).toBeTruthy();
    });

    it('should default OS to Windows', () => {
      // Note: the trailing `, ` comes from screen-reader-only text
      expect(getOsField().textContent).toEqual('Windows, ');
    });

    it('should allow user to select between 3 OSs', () => {
      const osField = getOsField();
      act(() => {
        fireEvent.click(osField);
      });
      const options = Array.from(
        renderResult.baseElement.querySelectorAll(
          '.euiSuperSelect__listbox button.euiSuperSelect__item'
        )
      ).map((button) => button.textContent);
      expect(options).toEqual(['Linux', 'Mac', 'Windows']);
    });

    it('should show Description as optional', () => {
      expect(getDescriptionField().required).toBe(false);
    });

    it('should be invalid if no name', () => {
      const emptyName = '  ';
      setTextFieldValue(getNameField(), emptyName);
      const expected = createOnChangeArgs({
        item: createItem({
          name: emptyName,
        }),
      });
      expect(formProps.onChange).toHaveBeenCalledWith(expected);
    });

    it('should correctly edit name', () => {
      setTextFieldValue(getNameField(), 'z');
      const expected = createOnChangeArgs({
        item: createItem({
          name: 'z',
        }),
      });
      expect(formProps.onChange).toHaveBeenCalledWith(expected);
    });

    it('should correctly edit description', () => {
      setTextFieldValue(getDescriptionField(), 'describe ta');
      const expected = createOnChangeArgs({
        item: createItem({ description: 'describe ta' }),
      });
      expect(formProps.onChange).toHaveBeenCalledWith(expected);
    });

    it('should correctly change OS', async () => {
      await userEvent.click(getOsField());
      await waitForEuiPopoverOpen();
      await userEvent.click(screen.getByRole('option', { name: 'Linux' }));
      const expected = createOnChangeArgs({
        item: createItem({ os_types: [OperatingSystem.LINUX] }),
      });
      expect(formProps.onChange).toHaveBeenCalledWith(expected);
    });
  });

  describe('ConditionBuilder', () => {
    beforeEach(() => render());

    it('should default to hash entry field', () => {
      const defaultCondition = getCondition();
      const labels = Array.from(defaultCondition.querySelectorAll('.euiFormRow__labelWrapper')).map(
        (label) => (label.textContent || '').trim()
      );
      expect(labels).toEqual(['Field', 'Operator', 'Value', '']);
    });

    it('should not allow the entry to be removed if its the only one displayed', () => {
      const defaultCondition = getCondition();
      expect(getConditionRemoveButton(defaultCondition).disabled).toBe(true);
    });

    it('should display 3 options for Field for Windows', async () => {
      const conditionFieldSelect = getConditionFieldSelect(getCondition());
      await userEvent.click(conditionFieldSelect);
      const options = Array.from(
        renderResult.baseElement.querySelectorAll(
          '.euiSuperSelect__listbox button.euiSuperSelect__item'
        )
      ).map((button) => button.textContent);
      expect(options.length).toEqual(3);
      expect(options).toEqual([
        'Hashmd5, sha1, or sha256',
        'PathThe full path of the application',
        'SignatureThe signer of the application',
      ]);
    });

    it('should show the value field as required after blur', () => {
      expect(getConditionValue(getCondition()).required).toEqual(false);
      act(() => {
        fireEvent.blur(getConditionValue(getCondition()));
      });
      expect(getConditionValue(getCondition()).required).toEqual(true);
    });

    describe('IS operator', () => {
      it('should show path malformed warning', () => {
        render();
        expect(screen.queryByText(INPUT_ERRORS.pathWarning(0))).toBeNull();

        const propsItem: Partial<ArtifactFormComponentProps['item']> = {
          entries: [createEntry(ConditionEntryField.PATH, 'match', 'malformed-path')],
        };
        formProps.item = { ...formProps.item, ...propsItem };
        render();
        expect(screen.getByText(INPUT_ERRORS.pathWarning(0))).not.toBeNull();
      });

      it('should show path malformed path warning for linux/mac without an executable name', () => {
        render();
        expect(screen.queryByText(INPUT_ERRORS.pathWarning(0))).toBeNull();
        expect(screen.queryByText(INPUT_ERRORS.wildcardPathWarning(0))).toBeNull();

        const propsItem: Partial<ArtifactFormComponentProps['item']> = {
          os_types: [OperatingSystem.LINUX],
          entries: [createEntry(ConditionEntryField.PATH, 'match', '/')],
        };
        formProps.item = { ...formProps.item, ...propsItem };
        render();
        expect(screen.getByText(INPUT_ERRORS.pathWarning(0))).not.toBeNull();
        expect(screen.queryByText(INPUT_ERRORS.wildcardPathWarning(0))).toBeNull();
      });

      it('should show path malformed path warning for windows with no executable name', () => {
        render();
        expect(screen.queryByText(INPUT_ERRORS.pathWarning(0))).toBeNull();
        expect(screen.queryByText(INPUT_ERRORS.wildcardPathWarning(0))).toBeNull();

        const propsItem: Partial<ArtifactFormComponentProps['item']> = {
          os_types: [OperatingSystem.WINDOWS],
          entries: [createEntry(ConditionEntryField.PATH, 'match', 'c:\\fold\\')],
        };
        formProps.item = { ...formProps.item, ...propsItem };
        render();
        expect(screen.getByText(INPUT_ERRORS.pathWarning(0))).not.toBeNull();
        expect(screen.queryByText(INPUT_ERRORS.wildcardPathWarning(0))).toBeNull();
      });
    });

    describe('MATCHES operator', () => {
      it('should show wildcard in path warning', () => {
        render();
        expect(screen.queryByText(INPUT_ERRORS.wildcardPathWarning(0))).toBeNull();

        const propsItem: Partial<ArtifactFormComponentProps['item']> = {
          os_types: [OperatingSystem.LINUX],
          entries: [createEntry(ConditionEntryField.PATH, 'wildcard', '/sys/wil*/*.app')],
        };
        formProps.item = { ...formProps.item, ...propsItem };
        render();
        expect(screen.getByText(INPUT_ERRORS.wildcardPathWarning(0))).not.toBeNull();
      });
    });

    describe('invisible character validation', () => {
      it('validates the trimmed value instead of warning about edge whitespace', () => {
        formProps.item = createItem({
          entries: [createEntry(ConditionEntryField.PATH, 'match', ' malformed-path ')],
        });
        rerender();

        const condition = getCondition();
        expect(getByTestId(condition, `${condition.dataset.testSubj}-value`)).not.toHaveAttribute(
          'aria-invalid',
          'true'
        );
        expect(condition).toContainElement(renderResult.getByText(INPUT_ERRORS.pathWarning(0)));
      });

      it('shows an invalid-hash error for a padded invalid hash', () => {
        formProps.item = createItem({
          entries: [createEntry(ConditionEntryField.HASH, 'match', ' not-a-hash ')],
        });
        rerender();

        expect(renderResult.getByText(INPUT_ERRORS.invalidHash(0))).toBeInTheDocument();
        expect(formProps.onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ isValid: false })
        );
      });

      it('blocks submission for an interior control character', async () => {
        formProps.item = createItem({
          name: 'Trusted app',
          entries: [createEntry(ConditionEntryField.PATH, 'match', 'C:\\Elastic\tEndpoint.exe')],
        });
        rerender();

        await userEvent.type(getNameField(), ' ');

        expect(renderResult.getByText(CONTROL_CHARACTER_ERROR)).toBeInTheDocument();
        expect(formProps.onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ isValid: false })
        );
      });

      it('keeps an edge-whitespace value submit-eligible', async () => {
        formProps.item = createItem({
          name: 'Trusted app',
          entries: [createEntry(ConditionEntryField.PATH, 'match', ' C:\\Elastic\\Endpoint.exe')],
        });
        rerender();

        await userEvent.type(getNameField(), ' ');

        expect(formProps.onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ isValid: true })
        );
      });

      it('trims a non-empty value on blur through the form change path', () => {
        formProps.item = createItem({
          entries: [createEntry(ConditionEntryField.PATH, 'match', ' C:\\Elastic\\Endpoint.exe ')],
        });
        rerender();

        fireEvent.blur(getConditionValue(getCondition()));

        expect(formProps.onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({
              entries: [expect.objectContaining({ value: 'C:\\Elastic\\Endpoint.exe' })],
            }),
          })
        );
      });
    });

    it('should display the `AND` button', () => {
      const andButton = getConditionBuilderAndButton();
      expect(andButton.textContent).toEqual('AND');
      expect(andButton.disabled).toEqual(false);
    });

    describe('and when the AND button is clicked', () => {
      beforeEach(async () => {
        const andButton = getConditionBuilderAndButton();
        await userEvent.click(andButton);
        // re-render with updated `newTrustedApp`
        formProps.item = (formProps.onChange as jest.Mock).mock.calls.at(-2)[0].item;
        rerender();
      });

      it('should add a new condition entry when `AND` is clicked with no column labels', () => {
        const condition2 = getCondition(1);
        expect(condition2.querySelectorAll('.euiFormRow__labelWrapper')).toHaveLength(0);
        expect(
          renderResult
            .getByTestId(`trustedApps-form-conditionsBuilder-group1-entry1`)
            .querySelectorAll('.euiFormRow__labelWrapper')
        ).toHaveLength(0);
      });

      it('should have remove buttons enabled when multiple conditions are present', () => {
        getAllConditions().forEach((condition) => {
          expect(getConditionRemoveButton(condition).disabled).toBe(false);
        });
      });

      it('should show the AND visual connector when multiple entries are present', () => {
        expect(getConditionBuilderAndConnectorBadge().textContent).toEqual('AND');
      });
    });

    describe('Advanced Mode', () => {
      afterEach(() => {
        cleanup();
      });

      it('should update tags to include "form_mode:advanced" and show advanced mode warning', async () => {
        await userEvent.click(getAdvancedModeToggle());

        const propsItem: Partial<ArtifactFormComponentProps['item']> = {
          tags: ['policy:all', 'form_mode:advanced'],
          entries: [],
        };
        const expected = createOnChangeArgs({
          item: createItem(propsItem),
        });
        expect(formProps.onChange).toHaveBeenCalledWith(expected);

        // update TA to show toggle change
        formProps.item = (formProps.onChange as jest.Mock).mock.calls.at(-2)[0].item;
        rerender();
        expect(
          getAdvancedModeToggle().classList.contains('euiButtonGroupButton-isSelected')
        ).toEqual(true);
        expect(getAdvancedModeUsageWarningHeader().textContent).toEqual(USING_ADVANCED_MODE);
        expect(getAdvancedModeUsageWarningBody().textContent).toEqual(
          USING_ADVANCED_MODE_DESCRIPTION
        );
      });

      it('when updating an existing trusted app, the previous form mode is enabled by default', async () => {
        const propsItem: Partial<ArtifactFormComponentProps['item']> = {
          name: 'edit advanced mode ta',
          entries: [
            { field: 'file.path.text', operator: 'included', type: 'match', value: 'asdf' },
          ],
          tags: ['policy:all', 'form_mode:advanced'],
        };

        formProps = {
          item: { ...formProps.item, ...propsItem },
          mode: 'edit',
          disabled: false,
          error: undefined,
          onChange: jest.fn((updates) => {
            latestUpdatedItem = updates.item;
          }),
        };

        latestUpdatedItem = { ...formProps.item, ...propsItem };

        rerenderWithLatestProps();

        expect(
          getAdvancedModeToggle().classList.contains('euiButtonGroupButton-isSelected')
        ).toEqual(true);
        expect(getBasicModeToggle().classList.contains('euiButtonGroupButton-isSelected')).toEqual(
          false
        );
      });

      it('retains previous user input when switching from basic to advanced mode', async () => {
        setTextFieldValue(getConditionValue(getCondition()), 'some value');
        const propsItem1: Partial<ArtifactFormComponentProps['item']> = {
          entries: [
            {
              field: ConditionEntryField.HASH,
              operator: 'included',
              type: 'match',
              value: 'some value',
            },
          ],
        };
        const expectedAfterBasicValueChange = createOnChangeArgs({
          item: createItem(propsItem1),
        });
        expect(formProps.onChange).toHaveBeenCalledWith(expectedAfterBasicValueChange);

        await userEvent.click(getAdvancedModeToggle());
        const propsItem2: Partial<ArtifactFormComponentProps['item']> = {
          tags: ['policy:all', 'form_mode:advanced'],
          entries: [],
        };
        const expectedAfterSwitchToAdvancedMode = createOnChangeArgs({
          item: createItem(propsItem2),
        });
        expect(formProps.onChange).toHaveBeenCalledWith(expectedAfterSwitchToAdvancedMode);

        await userEvent.click(getBasicModeToggle());
        const propsItem3: Partial<ArtifactFormComponentProps['item']> = {
          entries: [
            {
              field: ConditionEntryField.HASH,
              operator: 'included',
              type: 'match',
              value: 'some value',
            },
          ],
        };
        const expectedAfterSwitchToBasicMode = createOnChangeArgs({
          item: createItem(propsItem3),
        });
        expect(formProps.onChange).toHaveBeenCalledWith(expectedAfterSwitchToBasicMode);
      });

      describe('Process Descendants', () => {
        beforeEach(() => {
          mockedContext.setExperimentalFlag({
            filterProcessDescendantsForTrustedAppsEnabled: true,
          });
        });

        it('should not display button when feature flag is disabled', () => {
          mockedContext.setExperimentalFlag({
            filterProcessDescendantsForTrustedAppsEnabled: false,
          });
          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            tags: ['policy:all', 'form_mode:advanced'],
          };

          formProps.item = { ...formProps.item, ...propsItem };
          render();

          expect(
            renderResult.queryByTestId('trustedApps-processDescendantsSelector')
          ).not.toBeInTheDocument();
        });

        it('should not display button in basic mode', () => {
          render();

          expect(
            renderResult.queryByTestId('trustedApps-processDescendantsSelector')
          ).not.toBeInTheDocument();
        });

        it('should add the tag "trust_process_descendants" when the button is selected', async () => {
          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            tags: ['policy:all', 'form_mode:advanced'],
          };

          formProps.item = { ...formProps.item, ...propsItem };
          render();
          await userEvent.click(
            renderResult.getByTestId('trustedApps-filterProcessDescendantsButton')
          );

          const propsItem2: Partial<ArtifactFormComponentProps['item']> = {
            tags: ['policy:all', 'form_mode:advanced', TRUSTED_PROCESS_DESCENDANTS_TAG],
          };
          const expected = createOnChangeArgs({
            item: createItem(propsItem2),
          });
          expect(formProps.onChange).toHaveBeenCalledWith(expected);
        });

        it('should remove the tag "trust_process_descendants" when the button is not selected', async () => {
          // Start with the tag present
          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            tags: ['policy:all', 'form_mode:advanced', TRUSTED_PROCESS_DESCENDANTS_TAG],
          };

          formProps.item = { ...formProps.item, ...propsItem };
          render();

          // Click the "Events" button to deselect "Process Descendants"
          await userEvent.click(renderResult.getByTestId('trustedApps-filterEventsButton'));

          // The tag should be removed from the tags array
          const expectedTags = ['policy:all', 'form_mode:advanced'];
          const expected = createOnChangeArgs({
            item: createItem({ tags: expectedTags }),
          });
          expect(formProps.onChange).toHaveBeenCalledWith(expected);
        });

        it('should remove "process_descendants" tag when switching to basic mode', async () => {
          // Start in advanced mode with the tag present
          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            tags: ['policy:all', 'form_mode:advanced', TRUSTED_PROCESS_DESCENDANTS_TAG],
          };

          formProps.item = { ...formProps.item, ...propsItem };
          render();

          // Switch to basic mode
          userEvent.click(renderResult.getAllByTestId('basicModeButton')[0]);

          // The tag should be removed from the tags array
          const expectedTags = ['policy:all'];
          const expected = createOnChangeArgs({
            item: createItem({ tags: expectedTags }),
          });
          expect(formProps.onChange).toHaveBeenCalledWith(expected);
        });

        it('should retain "process_descendants" tag when switching from advanced mode to basic mode and then back to advanced mode options', async () => {
          // Start in advanced mode with the tag present
          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            tags: ['policy:all', 'form_mode:advanced', TRUSTED_PROCESS_DESCENDANTS_TAG],
          };

          formProps.item = { ...formProps.item, ...propsItem };
          render();

          // Click the "Process Descendants" button to ensure it's selected
          await userEvent.click(
            renderResult.getByTestId('trustedApps-filterProcessDescendantsButton')
          );

          // Switch to basic mode
          await userEvent.click(renderResult.getAllByTestId('basicModeButton')[0]);

          // The tag should be removed from the tags array
          const expectedTags = ['policy:all'];
          const expected = createOnChangeArgs({
            item: createItem({ tags: expectedTags }),
          });
          expect(formProps.onChange).toHaveBeenCalledWith(expected);

          // Switch back to advanced mode
          await userEvent.click(renderResult.getAllByTestId('advancedModeButton')[0]);

          // The process descendants tag should be present in the tags array
          const expectedAfterSwitchBack = createOnChangeArgs({
            item: createItem({
              tags: ['policy:all', 'form_mode:advanced', TRUSTED_PROCESS_DESCENDANTS_TAG],
            }),
          });
          expect(formProps.onChange).toHaveBeenCalledWith(expectedAfterSwitchBack);
        });
      });
    });
  });

  it('should display effective scope options', () => {
    render();
    const globalButton = renderResult.getByTestId(
      `${formPrefix}-effectedPolicies-global`
    ) as HTMLButtonElement;

    expect(globalButton.classList.contains('euiButtonGroupButton-isSelected')).toEqual(true);
    expect(
      renderResult.queryByTestId(`${formPrefix}-effectedPolicies-policiesSelectable`)
    ).toBeNull();
    expect(renderResult.queryByTestId('policy-id-0')).toBeNull();
  });

  describe('and the user visits required fields but does not fill them out', () => {
    beforeEach(() => {
      render();
      act(() => {
        fireEvent.blur(getNameField());
      });
      act(() => {
        fireEvent.blur(getConditionValue(getCondition()));
      });
    });

    it('should show Name validation error', () => {
      expect(renderResult.getByText(INPUT_ERRORS.name)).not.toBeNull();
    });

    it('should show Condition validation error', () => {
      expect(renderResult.getByText(INPUT_ERRORS.mustHaveValue(0)));
    });

    it('should NOT display any other errors', () => {
      expect(getAllValidationErrors()).toHaveLength(2);
    });
  });

  describe('and invalid data is entered', () => {
    beforeEach(() => render());

    it('should validate that Name has a non empty space value', () => {
      setTextFieldValue(getNameField(), '  ');
      expect(renderResult.getByText(INPUT_ERRORS.name));
    });

    it('should validate invalid Hash value', async () => {
      const valueField = getConditionValue(getCondition());
      await act(async () => {
        await userEvent.clear(valueField);
        await userEvent.type(valueField, 'someHASH');
        fireEvent.blur(valueField);
      });
      rerenderWithLatestProps();
      expect(renderResult.getByText(INPUT_ERRORS.invalidHash(0)));
    });

    it('should validate that a condition value has a non empty space value', () => {
      setTextFieldValue(getConditionValue(getCondition()), '  ');
      expect(renderResult.getByText(INPUT_ERRORS.mustHaveValue(0)));
    });

    it('should validate all condition values (when multiples exist) have non empty space value', async () => {
      const andButton = getConditionBuilderAndButton();
      await userEvent.click(andButton);
      formProps.item = (formProps.onChange as jest.Mock).mock.calls.at(-2)[0].item;
      rerender();

      setTextFieldValue(getConditionValue(getCondition()), 'someHASH');
      rerenderWithLatestProps();

      expect(renderResult.getByText(INPUT_ERRORS.mustHaveValue(1)));
    });

    it('should validate duplicated conditions', async () => {
      const andButton = getConditionBuilderAndButton();
      await userEvent.click(andButton);
      formProps.item = (formProps.onChange as jest.Mock).mock.calls.at(-2)[0].item;
      rerender();

      setTextFieldValue(getConditionValue(getCondition()), '');
      rerenderWithLatestProps();

      expect(
        renderResult.getAllByText(INPUT_ERRORS.noDuplicateField(ConditionEntryField.HASH))
      ).toHaveLength(2);
    });

    it('should validate multiple errors in form', async () => {
      const andButton = getConditionBuilderAndButton();

      await userEvent.click(andButton);
      formProps.item = (formProps.onChange as jest.Mock).mock.calls.at(-2)[0].item;
      rerender();

      setTextFieldValue(getConditionValue(getCondition()), 'someHASH');
      rerenderWithLatestProps();
      expect(renderResult.getByText(INPUT_ERRORS.invalidHash(0)));
      expect(renderResult.getByText(INPUT_ERRORS.mustHaveValue(1)));
    });
  });

  describe('warnings and confirmation modals', () => {
    describe('Basic mode', () => {
      describe('and a wildcard value is used with the IS operator', () => {
        describe('when the field is PATH', () => {
          beforeEach(() => {
            render();

            const propsItem: Partial<ArtifactFormComponentProps['item']> = {
              entries: [createEntry(ConditionEntryField.PATH, 'match', 'somewildcard*')],
            };
            latestUpdatedItem = { ...formProps.item, ...propsItem };
            rerenderWithLatestProps();
            act(() => {
              fireEvent.blur(getConditionValue(getCondition()));
            });
          });

          it('shows warning callout and help text warning if the field is PATH', async () => {
            expect(renderResult.getByTestId('wildcardWithWrongOperatorCallout'));
            expect(
              renderResult.getByText(INPUT_ERRORS.wildcardWithWrongOperatorWarning(0))
            ).toBeTruthy();
            expect(
              renderResult.queryByTestId('unnecessaryEscapingCallout')
            ).not.toBeInTheDocument();
          });

          it('should provide confirm modal labels when wildcard warning exists', async () => {
            await waitFor(() => {
              expect(formProps.onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                  confirmModalLabels: expect.objectContaining({
                    listOfWarnings: [expect.stringContaining('wildcards')],
                  }),
                })
              );
            });
          });
        });

        describe('when the field is HASH or SIGNATURE', () => {
          beforeEach(() => {
            render();

            const propsItem: Partial<ArtifactFormComponentProps['item']> = {
              entries: [createEntry(ConditionEntryField.HASH, 'match', 'somewildcard*')],
            };
            latestUpdatedItem = { ...formProps.item, ...propsItem };
            rerenderWithLatestProps();
            act(() => {
              fireEvent.blur(getConditionValue(getCondition()));
            });
          });

          it('shows a warning if field is HASH or SIGNATURE, but no callout is displayed', () => {
            expect(renderResult.getByText(INPUT_ERRORS.wildcardWithWrongField(0))).toBeTruthy();

            expect(
              renderResult.queryByTestId('wildcardWithWrongOperatorCallout')
            ).not.toBeInTheDocument();
          });

          it('should NOT provide confirm modal labels', async () => {
            await waitFor(() => {
              expect(formProps.onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                  confirmModalLabels: undefined,
                })
              );
            });
          });
        });
      });

      describe('and escaping is used', () => {
        beforeEach(() => {
          render();

          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            entries: [createEntry(ConditionEntryField.PATH, 'match', 'C:\\\\abc\\\\test.exe')],
          };
          latestUpdatedItem = { ...formProps.item, ...propsItem };

          rerenderWithLatestProps();
        });

        it('shows warning callout and help text warning if the field is PATH', async () => {
          act(() => {
            fireEvent.blur(getConditionValue(getCondition()));
          });

          expect(renderResult.getByTestId('unnecessaryEscapingCallout')).toBeInTheDocument();
          expect(
            renderResult.queryByTestId('wildcardWithWrongOperatorCallout')
          ).not.toBeInTheDocument();
        });

        it('should provide confirm modal labels when unnecessary escaping warning exists', async () => {
          await waitFor(() => {
            expect(formProps.onChange).toHaveBeenCalledWith(
              expect.objectContaining({
                confirmModalLabels: expect.objectContaining({
                  listOfWarnings: [expectReactNodeContainingMessage('escaping')],
                }),
              })
            );
          });
        });
      });

      describe('and both wildcard and escaping are used', () => {
        beforeEach(() => {
          render();

          const propsItem: Partial<ArtifactFormComponentProps['item']> = {
            entries: [createEntry(ConditionEntryField.PATH, 'match', 'C:\\\\abc*\\\\test.exe')],
          };
          latestUpdatedItem = { ...formProps.item, ...propsItem };

          rerenderWithLatestProps();
        });

        it('shows both warnings when both warnings exist', async () => {
          act(() => {
            fireEvent.blur(getConditionValue(getCondition()));
          });
          expect(renderResult.getByTestId('wildcardWithWrongOperatorCallout')).toBeInTheDocument();
          expect(renderResult.getByTestId('unnecessaryEscapingCallout')).toBeInTheDocument();
        });

        it('should provide confirm modal labels when both warnings exist', async () => {
          await waitFor(() => {
            expect(formProps.onChange).toHaveBeenCalledWith(
              expect.objectContaining({
                confirmModalLabels: expect.objectContaining({
                  listOfWarnings: [
                    expect.stringContaining('wildcards'),
                    expectReactNodeContainingMessage('escaping'),
                  ],
                }),
              })
            );
          });
        });
      });
    });

    describe('Advanced mode', () => {
      beforeEach(() => {
        formProps.item.tags = ['policy:all', 'form_mode:advanced'];
      });

      describe('and a wildcard value is used with the IS operator', () => {
        beforeEach(() => {
          formProps.item.entries = [
            createEntry(ConditionEntryField.PATH, 'match', 'somewildcard*'),
          ];
          render();
        });

        it('shows warning callout', async () => {
          expect(renderResult.getByTestId('wildcardWithWrongOperatorCallout')).toBeInTheDocument();
          expect(renderResult.queryByTestId('unnecessaryEscapingCallout')).not.toBeInTheDocument();
        });

        it('should provide confirm modal labels when wildcard warning exists', async () => {
          await waitFor(() => {
            expect(formProps.onChange).toHaveBeenCalledWith(
              expect.objectContaining({
                confirmModalLabels: expect.objectContaining({
                  listOfWarnings: [expect.stringContaining('wildcards')],
                }),
              })
            );
          });
        });
      });

      describe('and escaping is used', () => {
        beforeEach(() => {
          formProps.item.entries = [
            createEntry(ConditionEntryField.PATH, 'match', 'C:\\\\abc\\\\test.exe'),
          ];

          render();
        });

        it('shows warning callout and help text warning if the field is PATH', async () => {
          expect(renderResult.getByTestId('unnecessaryEscapingCallout')).toBeInTheDocument();
          expect(
            renderResult.queryByTestId('wildcardWithWrongOperatorCallout')
          ).not.toBeInTheDocument();
        });

        it('should provide confirm modal labels when unnecessary escaping warning exists', async () => {
          await waitFor(() => {
            expect(formProps.onChange).toHaveBeenCalledWith(
              expect.objectContaining({
                confirmModalLabels: expect.objectContaining({
                  listOfWarnings: [expectReactNodeContainingMessage('escaping')],
                }),
              })
            );
          });
        });
      });

      describe('and both wildcard and escaping are used', () => {
        beforeEach(() => {
          formProps.item.entries = [
            createEntry(ConditionEntryField.PATH, 'match', 'C:\\\\abc*\\\\test.exe'),
          ];
          render();
        });

        it('shows both warnings when both warnings exist', async () => {
          expect(renderResult.getByTestId('wildcardWithWrongOperatorCallout')).toBeInTheDocument();
          expect(renderResult.getByTestId('unnecessaryEscapingCallout')).toBeInTheDocument();
        });

        it('should provide confirm modal labels when both warnings exist', async () => {
          await waitFor(() => {
            expect(formProps.onChange).toHaveBeenCalledWith(
              expect.objectContaining({
                confirmModalLabels: expect.objectContaining({
                  listOfWarnings: [
                    expect.stringContaining('wildcards'),
                    expectReactNodeContainingMessage('escaping'),
                  ],
                }),
              })
            );
          });
        });
      });
    });
  });

  describe('and all required data passes validation', () => {
    it('should call change callback with isValid set to true and contain the new item', async () => {
      const propsItem: Partial<ArtifactFormComponentProps['item']> = {
        os_types: [OperatingSystem.LINUX],
        name: 'Some process',
        description: 'some description',
        entries: [
          createEntry(ConditionEntryField.HASH, 'match', 'e50fb1a0e5fff590ece385082edc6c41'),
        ],
      };
      formProps.item = { ...formProps.item, ...propsItem };
      render();
      // get around formChanged check
      await userEvent.type(getNameField(), ' ');

      expect(getAllValidationErrors()).toHaveLength(0);
      const expected = createOnChangeArgs({
        isValid: true,
        item: createItem(propsItem),
      });
      expect(formProps.onChange).toHaveBeenCalledWith(expected);
    });

    it('should not validate form to true if name input is empty', () => {
      const propsItem: Partial<ArtifactFormComponentProps['item']> = {
        name: 'some name',
        os_types: [OperatingSystem.LINUX],
        entries: [createEntry(ConditionEntryField.PATH, 'wildcard', '/sys/usr*/doc.app')],
      };
      formProps.item = { ...formProps.item, ...propsItem };
      render();

      expect(getAllValidationErrors()).toHaveLength(0);
      expect(getAllValidationWarnings()).toHaveLength(0);

      // clear name value
      latestUpdatedItem = { ...formProps.item, name: '' };
      rerenderWithLatestProps();
      act(() => {
        fireEvent.blur(getNameField());
      });

      expect(getAllValidationErrors()).toHaveLength(1);
      expect(getAllValidationWarnings()).toHaveLength(0);
      expect(formProps.onChange).toHaveBeenLastCalledWith({
        isValid: false,
        item: {
          ...formProps.item,
          name: '',
          os_types: [OperatingSystem.LINUX],
          entries: [
            {
              field: ConditionEntryField.PATH,
              operator: 'included',
              type: 'wildcard',
              value: '/sys/usr*/doc.app',
            },
          ],
        },
      });
    });
  });

  describe('validateValues function', () => {
    it('should not crash when validating advanced mode entries with nested types', () => {
      const item: ArtifactFormComponentProps['item'] = {
        list_id: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
        name: 'Test with nested entries',
        description: 'Testing nested entry validation',
        os_types: [OperatingSystem.WINDOWS],
        tags: ['policy:all', 'form_mode:advanced'],
        type: 'simple',
        entries: [
          // Nested entry - no top-level 'value' property
          {
            field: 'file.Ext',
            type: 'nested',
            entries: [
              {
                field: 'malware_signature.primary_signature.hash',
                operator: 'included',
                type: 'match',
                value: 'abc123',
              },
            ],
          },
          // Non-nested entry with empty value
          {
            field: 'process.hash.sha256',
            operator: 'included',
            type: 'match',
            value: '',
          },
        ],
      };

      // This should not throw when encountering nested entries
      expect(() => validateValues(item)).not.toThrow();

      // Should return invalid because of empty sha256 value
      const result = validateValues(item);
      expect(result.isValid).toBe(false);
    });

    it('should validate advanced mode entries with only nested entries as valid', () => {
      const item: ArtifactFormComponentProps['item'] = {
        list_id: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
        name: 'Test with only nested entries',
        description: '',
        os_types: [OperatingSystem.WINDOWS],
        tags: ['policy:all', 'form_mode:advanced'],
        type: 'simple',
        entries: [
          {
            field: 'file.Ext',
            type: 'nested',
            entries: [
              {
                field: 'code_signature.subject_name',
                operator: 'included',
                type: 'match',
                value: 'SomeSigner',
              },
            ],
          },
        ],
      };

      const result = validateValues(item);
      // Should be valid - nested entries are skipped in the empty value check
      expect(result.isValid).toBe(true);
    });

    it('should validate advanced mode with mixed nested and non-nested entries', () => {
      const item: ArtifactFormComponentProps['item'] = {
        list_id: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
        name: 'Test mixed entries',
        description: '',
        os_types: [OperatingSystem.WINDOWS],
        tags: ['policy:all', 'form_mode:advanced'],
        type: 'simple',
        entries: [
          {
            field: 'file.Ext',
            type: 'nested',
            entries: [
              {
                field: 'code_signature.subject_name',
                operator: 'included',
                type: 'match',
                value: 'SomeSigner',
              },
            ],
          },
          {
            field: 'process.hash.sha256',
            operator: 'included',
            type: 'match',
            value: 'valid-hash-value',
          },
        ],
      };

      const result = validateValues(item);
      // Should be valid - all non-nested entries have values
      expect(result.isValid).toBe(true);
    });
  });
});
