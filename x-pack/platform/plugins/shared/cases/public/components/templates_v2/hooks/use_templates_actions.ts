/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import { parse as yamlLoad, stringify as yamlDump } from 'yaml';
import type { Template } from '../../../../common/types/domain/template/v1';
import { useCasesEditTemplateNavigation } from '../../../common/navigation';
import { useBulkDeleteTemplates } from './use_bulk_delete_templates';
import { useCreateTemplate } from './use_create_template';
import { useUpdateTemplate } from './use_update_template';
import { useBulkExportTemplates } from './use_bulk_export_templates';
import { useCasesToast } from '../../../common/use_cases_toast';
import * as i18n from '../translations';

interface UseTemplatesActionsProps {
  onDeleteSuccess?: () => void;
}

export const useTemplatesActions = ({ onDeleteSuccess }: UseTemplatesActionsProps = {}) => {
  const { navigateToCasesEditTemplate } = useCasesEditTemplateNavigation();
  const { showSuccessToast } = useCasesToast();
  const { mutate: bulkDeleteTemplates, isLoading: isDeleting } = useBulkDeleteTemplates({
    onSuccess: onDeleteSuccess,
  });

  const { mutate: cloneTemplate, isLoading: isCloning } = useCreateTemplate({
    disableDefaultSuccessToast: true,
  });

  const { mutate: bulkExportTemplates, isLoading: isExporting } = useBulkExportTemplates();

  const { mutate: updateTemplate, isLoading: isUpdating } = useUpdateTemplate({
    disableDefaultSuccessToast: true,
  });

  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const handleEdit = useCallback(
    (template: Template) => {
      navigateToCasesEditTemplate({ templateId: template.templateId });
    },
    [navigateToCasesEditTemplate]
  );

  const handleClone = useCallback(
    (template: Template) => {
      // The list endpoint returns definition as a parsed object (via parseTemplate),
      // but the create endpoint expects a YAML string. Parse if needed, update the
      // name, then re-serialize to YAML.
      const parsed =
        typeof template.definition === 'string'
          ? (yamlLoad(template.definition) as Record<string, unknown>)
          : (template.definition as Record<string, unknown>);

      const clonedDefinition = yamlDump(
        { ...parsed, name: i18n.CLONED_TEMPLATE_NAME_PREFIX(template.name) },
        { lineWidth: 0 }
      ).trimEnd();

      cloneTemplate(
        {
          template: {
            owner: template.owner,
            definition: clonedDefinition,
            description: template.description,
            tags: template.tags,
            isEnabled: template.isEnabled,
          },
        },
        {
          onSuccess: () => {
            showSuccessToast(i18n.SUCCESS_CLONING_TEMPLATE(template.name));
          },
        }
      );
    },
    [cloneTemplate, showSuccessToast]
  );

  const handleExport = useCallback(
    (template: Template) => {
      bulkExportTemplates({ templateIds: [template.templateId] });
    },
    [bulkExportTemplates]
  );

  const handleDelete = useCallback((template: Template) => {
    setTemplateToDelete(template);
  }, []);

  const confirmDelete = useCallback(() => {
    if (templateToDelete) {
      bulkDeleteTemplates({ templateIds: [templateToDelete.templateId] });
      setTemplateToDelete(null);
    }
  }, [templateToDelete, bulkDeleteTemplates]);

  const cancelDelete = useCallback(() => {
    setTemplateToDelete(null);
  }, []);

  const handleIsEnabledChange = useCallback(
    (template: Template) => {
      updateTemplate(
        {
          templateId: template.templateId,
          template: { isEnabled: template.isEnabled === false },
        },
        {
          onSuccess: () => {
            showSuccessToast(i18n.SUCCESS_UPDATING_TEMPLATE);
          },
        }
      );
    },
    [updateTemplate, showSuccessToast]
  );

  return {
    handleEdit,
    handleClone,
    handleExport,
    handleDelete,
    confirmDelete,
    cancelDelete,
    templateToDelete,
    isDeleting,
    isCloning,
    isExporting,
    isUpdating,
    handleIsEnabledChange,
  };
};
