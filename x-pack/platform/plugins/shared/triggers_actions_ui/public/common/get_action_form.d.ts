import React from 'react';
import type { ActionAccordionFormProps } from '../application/sections/action_connector_form/action_form';
import type { ConnectorServices } from '../types';
export declare const getActionFormLazy: (props: ActionAccordionFormProps & {
    connectorServices: ConnectorServices;
}) => React.JSX.Element;
