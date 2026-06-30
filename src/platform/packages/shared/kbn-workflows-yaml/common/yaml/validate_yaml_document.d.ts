import type { Document } from 'yaml';
import { InvalidYamlSyntaxError } from '../errors';
export declare function getYamlDocumentErrors(document: Document): InvalidYamlSyntaxError[];
