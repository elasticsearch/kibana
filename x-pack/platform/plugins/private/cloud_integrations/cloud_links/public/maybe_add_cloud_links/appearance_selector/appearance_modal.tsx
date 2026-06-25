/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { type FC } from 'react';
import {
  EuiButton,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  useGeneratedHtmlId,
  EuiButtonEmpty,
  EuiCallOut,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type {
  DarkModeValue as ColorMode,
  ContrastModeValue as ContrastMode,
} from '@kbn/user-profile-components';
import { type Value, ValuesGroup } from './values_group';
import { useAppearance } from './use_appearance_hook';

const systemLabel = i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalSystemLabel', {
  defaultMessage: 'System',
});

const colorModeOptions: Array<Value<ColorMode>> = [
  {
    id: 'system',
    label: systemLabel,
    icon: 'display',
  },
  {
    id: 'light',
    label: i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalLightLabel', {
      defaultMessage: 'Light',
    }),
    icon: 'sun',
  },
  {
    id: 'dark',
    label: i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalDarkLabel', {
      defaultMessage: 'Dark',
    }),
    icon: 'moon',
  },
  {
    id: 'space_default',
    label: i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalSpaceDefaultLabel', {
      defaultMessage: 'Space default',
    }),
    icon: 'spaces',
    betaBadgeLabel: i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalBetaBadgeLabel', {
      defaultMessage: 'Deprecated',
    }),
    betaBadgeTooltipContent: i18n.translate(
      'xpack.cloudLinks.userMenuLinks.appearanceModalBetaBadgeTooltip',
      {
        defaultMessage: 'Space default settings will be deprecated in 10.0.',
      }
    ),
    betaBadgeIconType: 'warning',
  },
];

interface Props {
  closeModal: () => void;
  uiSettingsClient: IUiSettingsClient;
  isServerless: boolean;
}

const ColorModeGroup: FC<{
  isServerless: boolean;
  colorMode: ColorMode;
  onChange: ({ colorMode }: { colorMode: ColorMode }, updateUserProfile: boolean) => void;
}> = ({ isServerless, colorMode, onChange }) => {
  return (
    <>
      <ValuesGroup<ColorMode>
        title={i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalColorModeTitle', {
          defaultMessage: 'Color mode',
        })}
        values={
          isServerless
            ? colorModeOptions.filter(({ id }) => id !== 'space_default')
            : colorModeOptions
        }
        selectedValue={colorMode}
        onChange={(id) => {
          onChange({ colorMode: id }, false);
        }}
        ariaLabel={i18n.translate(
          'xpack.cloudLinks.userMenuLinks.appearanceModalColorModeAriaLabel',
          {
            defaultMessage: 'Appearance color mode',
          }
        )}
      />

      {colorMode === 'space_default' && (
        <>
          <EuiSpacer />
          <EuiCallOut
            announceOnMount={false}
            title={i18n.translate(
              'xpack.cloudLinks.userMenuLinks.appearanceModalDeprecatedSpaceDefaultTitle',
              {
                defaultMessage: 'Space default settings will be removed in a future version',
              }
            )}
            color="warning"
            iconType="warning"
          >
            <p>
              {i18n.translate(
                'xpack.cloudLinks.userMenuLinks.appearanceModalDeprecatedSpaceDefaultDescr',
                {
                  defaultMessage:
                    'All users with the Space default color mode enabled will be automatically transitioned to the System color mode.',
                }
              )}
            </p>
          </EuiCallOut>
          <EuiSpacer />
        </>
      )}
    </>
  );
};

const ContrastModeGroup: FC<{
  contrastMode: ContrastMode;
  onChange: ({ contrastMode }: { contrastMode: ContrastMode }, updateUserProfile: boolean) => void;
}> = ({ contrastMode, onChange }) => {
  return (
    <ValuesGroup<ContrastMode>
      title={i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalContrastModeTitle', {
        defaultMessage: 'Interface contrast',
      })}
      values={[
        {
          id: 'system',
          label: systemLabel,
          icon: 'display',
        },
        {
          id: 'standard',
          label: i18n.translate(
            'xpack.cloudLinks.userMenuLinks.appearanceModalContrastModeStandard',
            {
              defaultMessage: 'Normal',
            }
          ),
          icon: 'contrast',
        },
        {
          id: 'high',
          label: i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalContrastModeHigh', {
            defaultMessage: 'High',
          }),
          icon: 'contrastFill',
        },
      ]}
      selectedValue={contrastMode}
      onChange={(id) => {
        onChange({ contrastMode: id }, false);
      }}
      ariaLabel={i18n.translate(
        'xpack.cloudLinks.userMenuLinks.appearanceModalContrastModeAriaLabel',
        {
          defaultMessage: 'Appearance contrast mode',
        }
      )}
    />
  );
};

export const AppearanceModal: FC<Props> = ({ closeModal, uiSettingsClient, isServerless }) => {
  const modalTitleId = useGeneratedHtmlId();

  const {
    colorMode,
    initialColorModeValue,
    contrastMode,
    initialContrastModeValue,
    isLoading,
    onChange,
  } = useAppearance({
    uiSettingsClient,
    // Default new users (no persisted preference) to "System" so the UI follows their OS appearance.
    defaultColorMode: 'system',
    defaultContrastMode: 'standard',
  });

  return (
    <EuiModal
      aria-labelledby={modalTitleId}
      onClose={closeModal}
      style={
        isServerless
          ? undefined
          : // When not in serverless, we have the "Space default" as an option.
            // which renders a warning callout. We don't want the modal to scale up when
            // the callout is rendered, so we set a fixed width.
            { width: 580 }
      }
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle size="m" id={modalTitleId}>
          {i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalTitle', {
            defaultMessage: 'Appearance',
          })}
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <ColorModeGroup isServerless={isServerless} colorMode={colorMode} onChange={onChange} />

        <EuiSpacer />

        <ContrastModeGroup contrastMode={contrastMode} onChange={onChange} />
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty data-test-subj="appearanceModalDiscardButton" onClick={closeModal}>
          {i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalDiscardBtnLabel', {
            defaultMessage: 'Discard',
          })}
        </EuiButtonEmpty>

        <EuiButton
          data-test-subj="appearanceModalSaveButton"
          onClick={async () => {
            if (colorMode !== initialColorModeValue || contrastMode !== initialContrastModeValue) {
              onChange({ colorMode, contrastMode }, true);
            }
            closeModal();
          }}
          fill
          isLoading={isLoading}
        >
          {i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceModalSaveBtnLabel', {
            defaultMessage: 'Save changes',
          })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
