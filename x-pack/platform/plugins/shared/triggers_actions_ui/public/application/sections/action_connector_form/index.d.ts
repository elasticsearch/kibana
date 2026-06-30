import type { ConnectorAddModalProps } from './connector_add_modal';
import type { CreateConnectorFlyoutProps } from './create_connector_flyout';
import type { EditConnectorFlyoutProps } from './edit_connector_flyout';
export declare const CreateConnectorFlyout: (props: CreateConnectorFlyoutProps) => import("react").JSX.Element;
export declare const EditConnectorFlyout: (props: EditConnectorFlyoutProps) => import("react").JSX.Element;
export declare const ActionForm: (props: import("./action_form").ActionAccordionFormProps) => import("react").JSX.Element;
export declare const ConnectorAddModal: (props: ConnectorAddModalProps) => import("react").JSX.Element;
export declare const AddConnectorInline: (props: {
    actionTypesIndex: import("../../../types").ActionTypeIndex;
    actionItem: import("../../../types").RuleUiAction;
    connectors: import("@kbn/alerts-ui-shared").ActionConnector[];
    index: number;
    onAddConnector: () => void;
    onDeleteConnector: () => void;
    onSelectConnector: (connectorId: string) => void;
    emptyActionsIds: string[];
} & Pick<import("./action_form").ActionAccordionFormProps, "actionTypeRegistry">) => import("react").JSX.Element;
export type { ConnectorFormSchema } from '@kbn/alerts-ui-shared';
