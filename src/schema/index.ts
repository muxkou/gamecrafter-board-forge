import type { ValidationIssue } from '../types';

export * from './dsl.schema';
export * from './compiled-spec.schema';


/** 构造统一的校验问题对象（编译器/校验器复用） */
export function issue(
  code: string,
  path: string,
  message: string,
  hint?: string
): ValidationIssue {
  return { code, path, message, hint };
}
