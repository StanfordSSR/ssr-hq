import { createAdminClient } from '@/lib/supabase-admin';
import { listModules, type TrainingModule } from '@/lib/training-content';
import { normalizeEmail } from '@/lib/training-auth';

export type ModuleCompletion = {
  email: string;
  moduleSlug: string;
  score: number | null;
  attempts: number;
  completedAt: string;
};

export async function getCompletionsForEmail(email: string): Promise<ModuleCompletion[]> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from('training_completions')
    .select('email, module_slug, score, attempts, completed_at')
    .ilike('email', normalized);

  if (error) {
    throw new Error(`Failed to load completions: ${error.message}`);
  }

  return (data || []).map((row) => ({
    email: row.email,
    moduleSlug: row.module_slug,
    score: row.score,
    attempts: row.attempts,
    completedAt: row.completed_at
  }));
}

export async function getCompletion(email: string, moduleSlug: string): Promise<ModuleCompletion | null> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from('training_completions')
    .select('email, module_slug, score, attempts, completed_at')
    .ilike('email', normalized)
    .eq('module_slug', moduleSlug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load completion: ${error.message}`);
  }

  if (!data) return null;
  return {
    email: data.email,
    moduleSlug: data.module_slug,
    score: data.score,
    attempts: data.attempts,
    completedAt: data.completed_at
  };
}

export async function recordCompletion(
  email: string,
  moduleSlug: string,
  score: number,
  attempts: number
): Promise<void> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { error } = await supabase.from('training_completions').upsert(
    {
      email: normalized,
      module_slug: moduleSlug,
      score,
      attempts,
      completed_at: new Date().toISOString()
    },
    { onConflict: 'email,module_slug' }
  );

  if (error) {
    throw new Error(`Failed to record completion: ${error.message}`);
  }
}

export async function getRequiredOutstanding(email: string): Promise<TrainingModule | null> {
  const completions = await getCompletionsForEmail(email);
  const completedSlugs = new Set(completions.map((c) => c.moduleSlug));

  for (const mod of listModules()) {
    if (mod.required && !completedSlugs.has(mod.slug)) {
      return mod;
    }
  }
  return null;
}

export async function getMemberDisplayName(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  const { data: rosterRow } = await supabase
    .from('team_roster_members')
    .select('full_name')
    .ilike('stanford_email', normalized)
    .limit(1)
    .maybeSingle();

  if (rosterRow?.full_name) return rosterRow.full_name;

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name')
    .ilike('email', normalized)
    .limit(1)
    .maybeSingle();

  return profileRow?.full_name || null;
}
