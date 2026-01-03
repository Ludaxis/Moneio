/**
 * Workspace Permissions - Single Source of Truth
 *
 * This module defines all permissions and role mappings for the Moneio application.
 * All other modules should import from here to prevent duplication and drift.
 */

export type WorkspaceRole = 'owner' | 'admin' | 'member';

/**
 * All available permissions in the system
 */
export const PERMISSIONS = {
  // Workspace permissions
  WORKSPACE_READ: 'workspace:read',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_INVITE: 'workspace:invite',
  WORKSPACE_MANAGE_MEMBERS: 'workspace:manage_members',

  // Document permissions
  DOCUMENT_READ: 'document:read',
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_UPDATE: 'document:update',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_APPROVE: 'document:approve',

  // Invoice permissions
  INVOICE_READ: 'invoice:read',
  INVOICE_CREATE: 'invoice:create',
  INVOICE_UPDATE: 'invoice:update',
  INVOICE_DELETE: 'invoice:delete',
  INVOICE_APPROVE: 'invoice:approve',

  // Transaction permissions
  TRANSACTION_READ: 'transaction:read',
  TRANSACTION_CREATE: 'transaction:create',
  TRANSACTION_UPDATE: 'transaction:update',
  TRANSACTION_DELETE: 'transaction:delete',
  TRANSACTION_CATEGORIZE: 'transaction:categorize',
  TRANSACTION_APPROVE: 'transaction:approve',

  // Report permissions
  REPORT_READ: 'report:read',
  REPORT_EXPORT: 'report:export',

  // Settings permissions
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',

  // Category permissions
  CATEGORY_READ: 'category:read',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  // Rule permissions
  RULE_READ: 'rule:read',
  RULE_CREATE: 'rule:create',
  RULE_UPDATE: 'rule:update',
  RULE_DELETE: 'rule:delete',

  // GL permissions
  GL_READ: 'gl:read',
  GL_CREATE: 'gl:create',
  GL_UPDATE: 'gl:update',
  GL_DELETE: 'gl:delete',
  GL_POST: 'gl:post',
  GL_CLOSE: 'gl:close',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Permission definitions by role
 *
 * Owner: Full access to everything
 * Admin: Almost everything except workspace deletion and limited member management
 * Member: Read-only + limited create/update permissions
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: [
    PERMISSIONS.WORKSPACE_READ,
    PERMISSIONS.WORKSPACE_UPDATE,
    PERMISSIONS.WORKSPACE_DELETE,
    PERMISSIONS.WORKSPACE_INVITE,
    PERMISSIONS.WORKSPACE_MANAGE_MEMBERS,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.INVOICE_CREATE,
    PERMISSIONS.INVOICE_UPDATE,
    PERMISSIONS.INVOICE_DELETE,
    PERMISSIONS.INVOICE_APPROVE,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.TRANSACTION_CREATE,
    PERMISSIONS.TRANSACTION_UPDATE,
    PERMISSIONS.TRANSACTION_DELETE,
    PERMISSIONS.TRANSACTION_CATEGORIZE,
    PERMISSIONS.TRANSACTION_APPROVE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_UPDATE,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.CATEGORY_CREATE,
    PERMISSIONS.CATEGORY_UPDATE,
    PERMISSIONS.CATEGORY_DELETE,
    PERMISSIONS.RULE_READ,
    PERMISSIONS.RULE_CREATE,
    PERMISSIONS.RULE_UPDATE,
    PERMISSIONS.RULE_DELETE,
    PERMISSIONS.GL_READ,
    PERMISSIONS.GL_CREATE,
    PERMISSIONS.GL_UPDATE,
    PERMISSIONS.GL_DELETE,
    PERMISSIONS.GL_POST,
    PERMISSIONS.GL_CLOSE,
  ],

  admin: [
    PERMISSIONS.WORKSPACE_READ,
    PERMISSIONS.WORKSPACE_UPDATE,
    PERMISSIONS.WORKSPACE_INVITE,
    // Note: Admin cannot delete workspace or fully manage members
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_APPROVE,
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.INVOICE_CREATE,
    PERMISSIONS.INVOICE_UPDATE,
    PERMISSIONS.INVOICE_DELETE,
    PERMISSIONS.INVOICE_APPROVE,
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.TRANSACTION_CREATE,
    PERMISSIONS.TRANSACTION_UPDATE,
    PERMISSIONS.TRANSACTION_DELETE,
    PERMISSIONS.TRANSACTION_CATEGORIZE,
    PERMISSIONS.TRANSACTION_APPROVE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.SETTINGS_READ,
    // Note: Admin cannot update settings
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.CATEGORY_CREATE,
    PERMISSIONS.CATEGORY_UPDATE,
    PERMISSIONS.CATEGORY_DELETE,
    PERMISSIONS.RULE_READ,
    PERMISSIONS.RULE_CREATE,
    PERMISSIONS.RULE_UPDATE,
    PERMISSIONS.RULE_DELETE,
    PERMISSIONS.GL_READ,
    PERMISSIONS.GL_CREATE,
    PERMISSIONS.GL_UPDATE,
    PERMISSIONS.GL_DELETE,
    PERMISSIONS.GL_POST,
    // Note: Admin cannot close GL periods
  ],

  member: [
    PERMISSIONS.WORKSPACE_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    // Note: Member cannot delete or approve documents
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.INVOICE_CREATE,
    PERMISSIONS.INVOICE_UPDATE,
    // Note: Member cannot delete or approve invoices
    PERMISSIONS.TRANSACTION_READ,
    PERMISSIONS.TRANSACTION_CATEGORIZE,
    // Note: Member cannot create, update, delete, or approve transactions
    PERMISSIONS.REPORT_READ,
    // Note: Member cannot export reports
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.RULE_READ,
    PERMISSIONS.GL_READ,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: WorkspaceRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission as Permission);
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: WorkspaceRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role is at least admin level
 */
export function isAtLeastAdmin(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a role is owner
 */
export function isOwnerRole(role: WorkspaceRole): boolean {
  return role === 'owner';
}
