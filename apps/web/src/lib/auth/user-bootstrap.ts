import { prisma } from '@moneio/db';
import type { User as SupabaseUser } from '@supabase/supabase-js';

/**
 * Ensure user exists in our database
 * Called on first login via Supabase Auth
 */
export async function ensureUserExists(supabaseUser: SupabaseUser): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { id: supabaseUser.id },
  });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0],
        avatarUrl: supabaseUser.user_metadata?.avatar_url,
      },
    });
  }
}

/**
 * Get current user with their workspaces
 */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      workspaceMembers: {
        include: {
          workspace: true,
        },
      },
    },
  });
}
