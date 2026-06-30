import React from 'react';
import type { DocLinksStart } from '@kbn/core-doc-links-browser';
import type { HealthCheckErrors } from '@kbn/alerts-ui-shared/src/common/apis';
export interface RuleFormHealthCheckErrorProps {
    error: HealthCheckErrors;
    docLinks: DocLinksStart;
}
export declare const RuleFormHealthCheckError: (props: RuleFormHealthCheckErrorProps) => React.JSX.Element | null;
