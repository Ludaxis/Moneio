/**
 * Bulk Suggestions API
 *
 * POST /api/suggestions/bulk - Bulk approve/reject suggestions
 */

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const bulkSchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  suggestionIds: z.array(z.string().uuid()).optional(),
  minConfidence: z.number().min(0).max(100).optional(),
  type: z.enum(['categorization', 'match', 'all']).optional(),
});

interface CategorizationPayload {
  categoryId: string;
  categoryName: string;
}

/**
 * POST /api/suggestions/bulk
 * Bulk approve or reject suggestions
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, action, suggestionIds, minConfidence, type } = parsed.data;

    // Check permission
    const canUpdate = await hasPermission(user.id, workspaceId, 'transaction:update');
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    let processedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    // Process categorization suggestions
    if (!type || type === 'all' || type === 'categorization') {
      const categorizationWhere = {
        workspaceId,
        suggestionType: 'categorization' as const,
        status: 'pending',
        ...(suggestionIds && { id: { in: suggestionIds } }),
        ...(minConfidence !== undefined && {
          confidence: { gte: minConfidence / 100 },
        }),
      };

      const categorizationSuggestions = await prisma.aiSuggestion.findMany({
        where: categorizationWhere,
      });

      for (const suggestion of categorizationSuggestions) {
        try {
          if (action === 'approve') {
            const payload = suggestion.payloadJson as unknown as CategorizationPayload;

            // Verify category exists
            const category = await prisma.category.findFirst({
              where: { id: payload.categoryId, workspaceId },
            });

            if (!category) {
              errors.push({ id: suggestion.id, error: 'Category not found' });
              continue;
            }

            // Create or update categorization
            await prisma.transactionCategorization.upsert({
              where: {
                transactionId_categoryId: {
                  transactionId: suggestion.targetId,
                  categoryId: payload.categoryId,
                },
              },
              create: {
                workspaceId,
                transactionId: suggestion.targetId,
                categoryId: payload.categoryId,
                source: 'ai',
                approved: true,
                approvedAt: new Date(),
                approvedBy: user.id,
                confidence: suggestion.confidence,
              },
              update: {
                approved: true,
                approvedAt: new Date(),
                approvedBy: user.id,
              },
            });

            // Update suggestion status
            await prisma.aiSuggestion.update({
              where: { id: suggestion.id },
              data: { status: 'accepted' },
            });
          } else {
            // Reject
            await prisma.aiSuggestion.update({
              where: { id: suggestion.id },
              data: { status: 'rejected' },
            });
          }

          processedCount++;
        } catch (err) {
          errors.push({
            id: suggestion.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    // Process match suggestions
    if (!type || type === 'all' || type === 'match') {
      const matchWhere = {
        workspaceId,
        status: 'suggested',
        ...(suggestionIds && { id: { in: suggestionIds } }),
        ...(minConfidence !== undefined && {
          confidence: { gte: minConfidence / 100 },
        }),
      };

      const matchSuggestions = await prisma.match.findMany({
        where: matchWhere,
      });

      for (const match of matchSuggestions) {
        try {
          await prisma.match.update({
            where: { id: match.id },
            data: {
              status: action === 'approve' ? 'approved' : 'rejected',
              approvedAt: action === 'approve' ? new Date() : null,
              approvedBy: action === 'approve' ? user.id : null,
            },
          });

          processedCount++;
        } catch (err) {
          errors.push({
            id: match.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    // Create audit log for bulk action
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: `suggestions.bulk_${action}`,
        entityType: 'suggestions',
        entityId: workspaceId,
        newValue: {
          action,
          processedCount,
          errorCount: errors.length,
          minConfidence,
          type,
        },
      },
    });

    return NextResponse.json({
      success: true,
      action,
      processedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to process bulk suggestions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
