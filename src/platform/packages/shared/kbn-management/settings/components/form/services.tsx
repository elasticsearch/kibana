/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useContext } from 'react';

import {
  FieldCategoryKibanaProvider,
  FieldCategoryProvider,
} from '@kbn/management-settings-components-field-category';
import type { FormServices, FormKibanaDependencies, Services } from './types';
import { reloadPageToast } from './reload_page_toast';

const FormContext = React.createContext<Services | null>(null);

/**
 * Props for {@link FormProvider}.
 */
export interface FormProviderProps extends FormServices {
  children: React.ReactNode;
}

/**
 * React Provider that provides services to a {@link Form} component and its dependents.
 */
export const FormProvider = ({ children, ...services }: FormProviderProps) => {
  const { saveChanges, showError, showReloadPagePrompt, ...rest } = services;

  return (
    <FormContext.Provider value={{ saveChanges, showError, showReloadPagePrompt }}>
      <FieldCategoryProvider {...rest}>{children}</FieldCategoryProvider>
    </FormContext.Provider>
  );
};

/**
 * Kibana-specific Provider that maps Kibana plugins and services to a {@link FormProvider}.
 */
export const FormKibanaProvider: FC<PropsWithChildren<FormKibanaDependencies>> = ({
  children,
  ...deps
}) => {
  const { settings, notifications, docLinks } = deps;

  const services: Services = {
    saveChanges: async (changes) => {
      const clientChanges: Array<[string, any]> = [];
      const globalChanges: Array<[string, any]> = [];

      Object.entries(changes).map(([key, { unsavedValue, scope }]) =>
        scope === 'namespace'
          ? clientChanges.push([key, unsavedValue])
          : globalChanges.push([key, unsavedValue])
      );

      // We need to do this two promises separately
      if (clientChanges.length > 0) {
        await Promise.all(clientChanges.map(([key, value]) => settings.client.set(key, value)));
      }
      if (globalChanges.length > 0) {
        await Promise.all(
          globalChanges.map(([key, value]) => settings.globalClient.set(key, value))
        );
      }
    },
    showError: (message: string) => notifications.toasts.addDanger(message),
    showReloadPagePrompt: () => notifications.toasts.add(reloadPageToast()),
  };

  return (
    <FormContext.Provider value={services}>
      <FieldCategoryKibanaProvider {...{ docLinks, notifications, settings }}>
        {children}
      </FieldCategoryKibanaProvider>
    </FormContext.Provider>
  );
};

/**
 * React hook for accessing pre-wired services.
 */
export const useServices = () => {
  const context = useContext(FormContext);

  if (!context) {
    throw new Error(
      'FormContext is missing. Ensure your component or React root is wrapped with FormProvider.'
    );
  }

  return context;
};
