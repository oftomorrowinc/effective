/**
 * Schema barrel — the public surface of `effective`'s type system.
 *
 * Every schema here is part of the package's public contract. Breaking changes
 * to any exported type are MAJOR version bumps. Additive changes (new optional
 * fields, new enum values, new schemas) are MINOR.
 *
 * Files in this directory:
 *   - finding.ts       — Finding, Severity, Verdict, VerifyResult
 *   - rule.ts          — Rule (discriminated union), kinds, RuleCategory, PromptProjection
 *   - scope.ts         — Scope, Role, Expectations, built-in role defaults
 *   - constitution.ts  — Constitution, ToolchainConfig, AuditConfig, RuleOverride, RoleDefinition
 *   - exception.ts     — Exception, ExceptionRegistry, EscapeHatch, BuiltInExceptionCategory
 *   - catalogue.ts     — CatalogueEntry, Catalogue, ObservedInstance
 *   - principle.ts     — Principle, Principles
 */

export * from './finding.js';
export * from './rule.js';
export * from './scope.js';
export * from './constitution.js';
export * from './exception.js';
export * from './catalogue.js';
export * from './principle.js';
