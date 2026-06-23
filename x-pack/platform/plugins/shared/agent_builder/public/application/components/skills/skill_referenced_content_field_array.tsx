/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { useController, useFieldArray, useWatch, type Control } from 'react-hook-form';
import { maxReferencedContentItems, AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { labels } from '../../utils/i18n';
import type { ReferencedContentItem, SkillFormData } from './skill_form_validation';
import { ReferencedContentFileCard } from './referenced_content_file_card';
import { SkillReferencedContentReadOnly } from './skill_referenced_content_read_only';

const DEFAULT_REFERENCED_FILE: ReferencedContentItem = {
  name: '',
  relativePath: './',
  content: '',
};

interface ReferencedContentFileRowProps {
  index: number;
  control: Control<SkillFormData>;
  skillName: string;
  onRemove: () => void;
}

const ReferencedContentFileRow: React.FC<ReferencedContentFileRowProps> = ({
  index,
  control,
  skillName,
  onRemove,
}) => {
  const nameField = useController({ control, name: `referenced_content.${index}.name` });
  const pathField = useController({ control, name: `referenced_content.${index}.relativePath` });
  const contentField = useController({ control, name: `referenced_content.${index}.content` });

  return (
    <EuiFlexGroup alignItems="flexStart" gutterSize="m" responsive={false}>
      <EuiFlexItem grow={1}>
        <ReferencedContentFileCard
          skillName={skillName}
          fileName={nameField.field.value}
          relativePath={pathField.field.value}
          content={contentField.field.value}
          onFileNameChange={nameField.field.onChange}
          onRelativePathChange={pathField.field.onChange}
          onContentChange={contentField.field.onChange}
          onFileNameBlur={nameField.field.onBlur}
          onRelativePathBlur={pathField.field.onBlur}
          onContentBlur={contentField.field.onBlur}
          fileNameError={nameField.fieldState.error?.message}
          relativePathError={pathField.fieldState.error?.message}
          contentError={contentField.fieldState.error?.message}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiToolTip
          content={labels.skills.referencedFileSection.removeFileAriaLabel}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            onClick={onRemove}
            aria-label={labels.skills.referencedFileSection.removeFileAriaLabel}
            data-test-subj={`agentBuilderSkillReferencedContentRemove-${index}`}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.REMOVE_REFERENCED_FILE,
              detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
            })}
          />
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const SkillReferencedContentReadOnlySection: React.FC<{ control: Control<SkillFormData> }> = ({
  control,
}) => {
  const skillName = useWatch({ control, name: 'name' }) ?? '';
  const items: ReferencedContentItem[] = useWatch({ control, name: 'referenced_content' }) ?? [];

  return (
    <div data-test-subj="agentBuilderSkillReferencedContentSection">
      <SkillReferencedContentReadOnly skillName={skillName} items={items} />
    </div>
  );
};

const SkillReferencedContentFieldArrayEdit: React.FC<{ control: Control<SkillFormData> }> = ({
  control,
}) => {
  const skillName = useWatch({ control, name: 'name' }) ?? '';

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'referenced_content',
  });

  const atLimit = fields.length >= maxReferencedContentItems;

  const filesAddedLabel = useMemo(
    () =>
      labels.skills.referencedFileSection.filesAddedCount(fields.length, maxReferencedContentItems),
    [fields.length]
  );

  return (
    <div data-test-subj="agentBuilderSkillReferencedContentSection">
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiButton
            iconType="plusInCircle"
            onClick={() => append(DEFAULT_REFERENCED_FILE)}
            disabled={atLimit}
            title={
              atLimit
                ? labels.skills.referencedFileSection.addFileButtonDisabledTooltip(
                    maxReferencedContentItems
                  )
                : undefined
            }
            data-test-subj="agentBuilderSkillReferencedContentAddFile"
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.ADD_REFERENCED_FILE,
              detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
            })}
          >
            {labels.skills.referencedFileSection.addFileButton}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText
            size="s"
            color="subdued"
            data-test-subj="agentBuilderSkillReferencedContentCount"
          >
            {filesAddedLabel}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />

      <EuiFlexGroup direction="column" gutterSize="xl">
        {fields.map((field, index) => (
          <EuiFlexItem key={field.id} grow={false}>
            <ReferencedContentFileRow
              index={index}
              control={control}
              skillName={skillName}
              onRemove={() => remove(index)}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </div>
  );
};

export interface SkillReferencedContentFieldArrayProps {
  control: Control<SkillFormData>;
  readOnly?: boolean;
}

export const SkillReferencedContentFieldArray: React.FC<SkillReferencedContentFieldArrayProps> = ({
  control,
  readOnly = false,
}) => {
  if (readOnly) {
    return <SkillReferencedContentReadOnlySection control={control} />;
  }
  return <SkillReferencedContentFieldArrayEdit control={control} />;
};
