import { z } from 'zod';

/**
 * Rule condition field - the transaction field to match against
 */
export type RuleConditionField = 'description' | 'amount' | 'merchant';

/**
 * Rule condition operator - how to compare the field value
 */
export type RuleConditionOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'regex'
  | 'gt'
  | 'lt'
  | 'between';

/**
 * A single rule condition
 */
export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string | number | [number, number];
  caseSensitive?: boolean;
}

/**
 * Rule conditions container with match mode
 */
export interface RuleConditions {
  match: 'all' | 'any'; // AND vs OR
  conditions: RuleCondition[];
}

/**
 * Zod schema for a single rule condition
 */
export const ruleConditionSchema = z.object({
  field: z.enum(['description', 'amount', 'merchant']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'gt', 'lt', 'between']),
  value: z.union([z.string(), z.number(), z.tuple([z.number(), z.number()])]),
  caseSensitive: z.boolean().optional(),
});

/**
 * Zod schema for rule conditions container
 */
export const ruleConditionsSchema = z.object({
  match: z.enum(['all', 'any']),
  conditions: z.array(ruleConditionSchema).min(1),
});

/**
 * Zod schema for creating a rule
 */
export const createRuleSchema = z.object({
  workspaceId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(255),
  conditions: ruleConditionsSchema,
  priority: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

/**
 * Zod schema for updating a rule
 */
export const updateRuleSchema = z.object({
  workspaceId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  conditions: ruleConditionsSchema.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Zod schema for rule list query params
 */
export const listRulesQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

/**
 * Zod schema for testing a rule
 */
export const testRuleSchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(10),
});

/**
 * Inferred types from schemas
 */
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type ListRulesQuery = z.infer<typeof listRulesQuerySchema>;
export type TestRuleInput = z.infer<typeof testRuleSchema>;
