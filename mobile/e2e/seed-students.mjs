// CI only: creates stable test-student accounts, enrolls them in a class by
// invite code, and fabricates believable deck/quiz progress so the teacher
// dashboard gets a mixed roster (completed / in progress / not started).
//
//   node e2e/seed-students.mjs <inviteCode> [--count 3] [--out tokens.ndjson]
//
// Env: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional
// SUPABASE_ANON_KEY (used as the apikey for user-scoped calls when present).
// Tokens are masked in CI logs and written to --out (one JSON object per
// line: email/user/rt) for driving the app via /e2e/session?rt=.
import { appendFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY ?? serviceKey;
if (!url || !serviceKey) throw new Error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const args = process.argv.slice(2);
const code = args[0] ?? process.env.E2E_INVITE;
if (!code) throw new Error('usage: node e2e/seed-students.mjs <inviteCode> [--count N] [--out file]');
const countFlag = args.indexOf('--count');
const count = countFlag >= 0 ? Number(args[countFlag + 1]) : 3;
const outFlag = args.indexOf('--out');
const outFile = outFlag >= 0 ? args[outFlag + 1] : null;
if (!outFile && !process.env.GITHUB_OUTPUT) console.log('(no --out and no GITHUB_OUTPUT; tokens stay masked)');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const outputs = [];
const summary = [];

/** Sign a user in server-side (no captcha) and return the access token. */
async function mintAccess(email) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError) throw linkError;
  const admin2 = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin2.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (error || !data.session) throw error ?? new Error(`no session for ${email}`);
  return { access: data.session.access_token, user: data.session.user, rt: data.session.refresh_token };
}

/** A client that talks as the student (RLS applies via the bearer JWT). */
function asUser(access) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  });
}

async function findClassroom(codeValue) {
  const { data, error } = await admin.from('classrooms').select('id').eq('invite_code', codeValue).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] ?? null)?.id ?? null;
}

for (let i = 1; i <= count; i++) {
  const email = `e2e-student-${i}@example.com`;
  const fullName = `Test Student ${i}`;

  let { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = users.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { onboarding_completed: true, full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  }
  // Roster names come from user_profiles.full_name.
  await admin.from('user_profiles').upsert({ user_id: user.id, full_name: fullName }, { onConflict: 'user_id' });

  const { access, rt } = await mintAccess(email);
  process.stdout.write(`::add-mask::${rt}\n`);
  const authed = asUser(access);

  // Join the class (idempotent: an existing member gets the classroom back).
  const { data: joined, error: joinError } = await authed.rpc('join_classroom_with_code', { p_code: code });
  const classroomId = joinError ? (await findClassroom(code)) : (joined ?? [])[0]?.id;
  if (!classroomId) throw new Error(`could not join class with code ${code}: ${joinError?.message ?? 'no rows'}`);

  let state = 'not started';
  if (i <= 2) {
    // The deck assignment (newest one in the class).
    const { data: assignments, error: aError } = await admin
      .from('assignments').select('id, kind, deck_id')
      .eq('classroom_id', classroomId).eq('kind', 'deck')
      .order('created_at', { ascending: false }).limit(1);
    if (aError) throw aError;
    const assignment = (assignments ?? [])[0];
    if (!assignment) throw new Error('no deck assignment in this class to fabricate progress for');

    const { data: accepted, error: acceptError } = await authed.rpc('accept_class_deck', { p_assignment_id: assignment.id });
    if (acceptError && !String(acceptError.message).includes('not a deck')) throw acceptError;
    const localDeckId = accepted?.deck_id;
    if (!localDeckId) throw new Error(`accept_class_deck returned no deck for ${email}`);

    const { data: cards, error: cError } = await admin.from('cards').select('id').eq('deck_id', localDeckId).order('id');
    if (cError) throw cError;

    const reviews =
      i === 1
        ? (cards ?? []).map((c, idx) => ({ card_id: c.id, user_id: user.id, rating: [2, 2, 1, 3, 2, 0, 2, 3][idx % 8] ?? 2, srs_result: {} }))
        : (cards ?? []).slice(0, 3).map((c) => ({ card_id: c.id, user_id: user.id, rating: 2, srs_result: {} }));
    if (reviews.length) {
      // One row per review event (idempotency key was widened to
      // user+card+reviewed_at; re-runs just add review events, progress
      // counts DISTINCT card_id).
      const { error: rError } = await admin.from('card_reviews').insert(reviews);
      if (rError) throw rError;
      const { error: pError } = await authed.rpc('record_assignment_progress', {
        p_assignment_id: assignment.id, p_local_deck_id: localDeckId, p_quiz_correct: null, p_quiz_total: null,
      });
      if (pError) throw pError;
    }
    state = i === 1 ? 'completed' : 'in progress (3 cards)';

    if (i === 1) {
      // Take the quiz all-first-choice like the live e2e run did.
      const { data: quizRow, error: qAError } = await admin
        .from('assignments').select('id').eq('classroom_id', classroomId).eq('kind', 'quiz').limit(1);
      if (qAError) throw qAError;
      const quiz = (quizRow ?? [])[0];
      if (quiz) {
        const { data: questions, error: qqError } = await authed.rpc('get_quiz_questions', { p_assignment_id: quiz.id });
        if (qqError) throw qqError;
        const answers = Object.fromEntries(((questions ?? [])).map((q) => [q.card_id, q.choices[0]]));
        if (Object.keys(answers).length) {
          const { error: sError } = await authed.rpc('submit_quiz_attempt', { p_assignment_id: quiz.id, p_answers: answers });
          if (sError) console.warn(`[seed] quiz attempt skipped for ${email}: ${sError.message}`);
          else state = 'completed (deck + quiz)';
        }
      }
    }
  }

  outputs.push({ email, user: user.id, rt });
  summary.push(`${email}  ${user.id.slice(0, 8)}  ${state}`);
}

if (outFile) writeFileSync(outFile, outputs.map((o) => JSON.stringify(o)).join('\n') + '\n');
if (process.env.GITHUB_OUTPUT) {
  const lines = outputs.map((o, idx) => `rt_${idx + 1}=${o.rt}\nemail_${idx + 1}=${o.email}\nuser_${idx + 1}=${o.user}\n`).join('');
  appendFileSync(process.env.GITHUB_OUTPUT, lines);
}
console.log(['seeded test students:', ...summary].join('\n'));
