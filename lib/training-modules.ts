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

export async function markModuleStarted(email: string, moduleSlug: string): Promise<void> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  const { data: existing } = await supabase
    .from('training_module_starts')
    .select('started_at')
    .eq('email', normalized)
    .eq('module_slug', moduleSlug)
    .maybeSingle();

  if (existing) return;

  await supabase
    .from('training_module_starts')
    .insert({ email: normalized, module_slug: moduleSlug });
}

export async function getModuleStartedAt(email: string, moduleSlug: string): Promise<Date | null> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { data } = await supabase
    .from('training_module_starts')
    .select('started_at')
    .eq('email', normalized)
    .eq('module_slug', moduleSlug)
    .maybeSingle();

  return data?.started_at ? new Date(data.started_at) : null;
}

export async function getCurrentChapter(email: string, moduleSlug: string): Promise<number> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from('training_module_starts')
    .select('current_chapter')
    .eq('email', normalized)
    .eq('module_slug', moduleSlug)
    .maybeSingle();

  if (error) {
    console.error('getCurrentChapter failed', error);
    throw new Error(`Failed to read training progress: ${error.message}`);
  }

  const raw = data?.current_chapter;
  if (typeof raw === 'number' && raw >= 0) return raw;
  return 0;
}

export async function setCurrentChapter(
  email: string,
  moduleSlug: string,
  chapterIndex: number
): Promise<void> {
  if (!Number.isFinite(chapterIndex) || chapterIndex < 0) return;
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  // Only advance forward — never let a client request to a lower chapter rewrite progress.
  const { data: existing, error: selectError } = await supabase
    .from('training_module_starts')
    .select('current_chapter')
    .eq('email', normalized)
    .eq('module_slug', moduleSlug)
    .maybeSingle();

  if (selectError) {
    console.error('setCurrentChapter select failed', selectError);
    throw new Error(`Failed to read training progress: ${selectError.message}`);
  }

  if (existing && typeof existing.current_chapter === 'number' && existing.current_chapter >= chapterIndex) {
    return;
  }

  const { error: upsertError } = await supabase
    .from('training_module_starts')
    .upsert(
      {
        email: normalized,
        module_slug: moduleSlug,
        current_chapter: Math.floor(chapterIndex)
      },
      { onConflict: 'email,module_slug' }
    );

  if (upsertError) {
    console.error('setCurrentChapter upsert failed', upsertError);
    throw new Error(`Failed to save training progress: ${upsertError.message}`);
  }
}

export async function clearModuleStart(email: string, moduleSlug: string): Promise<void> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  await supabase
    .from('training_module_starts')
    .delete()
    .eq('email', normalized)
    .eq('module_slug', moduleSlug);
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

export async function recordOptIn(email: string, moduleSlug: string): Promise<void> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { error } = await supabase
    .from('training_module_opt_ins')
    .upsert({ email: normalized, module_slug: moduleSlug }, { onConflict: 'email,module_slug' });
  if (error) {
    throw new Error(`Failed to record opt-in: ${error.message}`);
  }
}

export async function hasOptedIn(email: string, moduleSlug: string): Promise<boolean> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from('training_module_opt_ins')
    .select('module_slug')
    .ilike('email', normalized)
    .eq('module_slug', moduleSlug)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read opt-in: ${error.message}`);
  }
  return Boolean(data);
}

export async function getOptInsForEmail(email: string): Promise<string[]> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);
  const { data, error } = await supabase
    .from('training_module_opt_ins')
    .select('module_slug')
    .ilike('email', normalized);
  if (error) {
    throw new Error(`Failed to read opt-ins: ${error.message}`);
  }
  return (data || []).map((row) => row.module_slug);
}

export async function getRequiredOutstanding(email: string): Promise<TrainingModule | null> {
  const [completions, optIns] = await Promise.all([
    getCompletionsForEmail(email),
    getOptInsForEmail(email)
  ]);
  const completedSlugs = new Set(completions.map((c) => c.moduleSlug));
  const optInSlugs = new Set(optIns);

  for (const mod of listModules()) {
    if (completedSlugs.has(mod.slug)) continue;
    if (mod.required) return mod;
    if (mod.gatedByOptIn && optInSlugs.has(mod.slug)) return mod;
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
