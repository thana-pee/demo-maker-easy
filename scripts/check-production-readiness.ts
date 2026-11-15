import fs from 'node:fs';
import path from 'node:path';
import { evaluateProductionReadiness } from '../src/lib/productionReadiness';
import { generatePromptPayPayload, normalizePromptPayReceiver } from '../src/lib/promptpayQr';

function loadEnvLocalIntoMap(): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...process.env };
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    return merged;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) {
      merged[key] = val;
    }
  }
  return merged;
}

function flagIcon(ok: boolean): string {
  return ok ? '[PASS]' : '[MISS]';
}

async function runLiveSupabaseChecks(env: Record<string, string | undefined>): Promise<{
  allPassed: boolean;
}> {
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !anonKey) {
    console.log('\n[SKIP] Live check skipped: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    return { allPassed: false };
  }

  let allPassed = true;
  console.log('\n--- Live Supabase Verification ---');

  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    if (!authRes.ok) {
      allPassed = false;
      console.log(`[FAIL] Supabase Auth settings unreachable (HTTP ${authRes.status})`);
    } else {
      const settings = (await authRes.json()) as {
        external?: Record<string, boolean>;
        disable_signup?: boolean;
      };
      const googleOn = Boolean(settings.external?.google);
      const emailOn = Boolean(settings.external?.email);
      console.log(`${flagIcon(true)} Supabase Auth reachable`);
      console.log(`${flagIcon(googleOn)} Google OAuth Provider: ${googleOn ? 'ENABLED' : 'DISABLED (open Auth -> Providers -> Google)'}`);
      console.log(`${flagIcon(emailOn)} Email OTP / Magic Link: ${emailOn ? 'ENABLED' : 'DISABLED'}`);
      if (!googleOn) allPassed = false;
    }
  } catch (err) {
    allPassed = false;
    console.log(`[FAIL] Supabase Auth check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!serviceKey) {
    console.log('[MISS] SUPABASE_SERVICE_ROLE_KEY not set — cannot verify tables or RPCs yet.');
    return { allPassed: false };
  }

  const headers: Record<string, string> = {
    apikey: serviceKey,
  };
  if (!serviceKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }

  for (const table of ['songs', 'user_wallets', 'credit_transactions', 'topup_orders']) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=0`, { headers });
      const ok = res.ok;
      if (!ok) allPassed = false;
      console.log(`${flagIcon(ok)} Table public.${table}${ok ? '' : ` (HTTP ${res.status} — run supabase/ALL_IN_ONE_SETUP.sql)`}`);
    } catch (err) {
      allPassed = false;
      console.log(`[FAIL] Table public.${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const specRes = await fetch(`${supabaseUrl}/rest/v1/`, { headers });
    if (!specRes.ok) {
      allPassed = false;
      console.log(`[FAIL] PostgREST OpenAPI RPC inspection returned HTTP ${specRes.status}`);
    } else {
      const spec = (await specRes.json()) as { paths?: Record<string, unknown> };
      const paths = spec.paths || {};
      for (const fnName of [
        'init_user_wallet',
        'atomic_deduct_credits',
        'atomic_refund_credits',
        'atomic_credit_topup_from_slip',
      ]) {
        const exists = `/rpc/${fnName}` in paths;
        if (!exists) allPassed = false;
        console.log(`${flagIcon(exists)} RPC public.${fnName}${exists ? '' : ' (missing — run supabase/ALL_IN_ONE_SETUP.sql)'}`);
      }
    }
  } catch (err) {
    allPassed = false;
    console.log(`[FAIL] RPC check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { allPassed };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const live = args.has('--live');
  const strict = args.has('--strict');

  const env = loadEnvLocalIntoMap();
  const report = evaluateProductionReadiness(env);

  console.log('=== Demo Maker Easy — Production Activation Check ===');
  console.log(`Billing Mode : ${report.billingMode}`);
  console.log(`Gemini Model : ${report.geminiModel}`);
  console.log('');
  console.log(`${flagIcon(report.checks.geminiApiKey)} GEMINI_API_KEY`);
  console.log(`${flagIcon(report.checks.supabaseUrl)} NEXT_PUBLIC_SUPABASE_URL`);
  console.log(`${flagIcon(report.checks.supabaseAnonKey)} NEXT_PUBLIC_SUPABASE_ANON_KEY`);
  console.log(
    `${flagIcon(report.checks.supabaseServiceRoleKey && report.checks.supabaseKeysDistinct)} SUPABASE_SERVICE_ROLE_KEY${
      !report.checks.supabaseKeysDistinct ? ' (ERROR: same as anon key!)' : ''
    }`
  );
  console.log(
    `${flagIcon(report.checks.promptPayReceiverValid)} PROMPTPAY_RECEIVER_ID${
      report.checks.promptPayReceiverId && !report.checks.promptPayReceiverValid
        ? ' (invalid digits — must be 10/13/15)'
        : ''
    }`
  );
  console.log(`${flagIcon(report.checks.promptPayReceiverName)} PROMPTPAY_RECEIVER_NAME`);
  console.log(`${flagIcon(report.checks.slipVerifyApiUrl)} SLIP_VERIFY_API_URL`);
  console.log(`${flagIcon(report.checks.slipVerifyApiKey)} SLIP_VERIFY_API_KEY`);

  if (report.checks.promptPayReceiverValid && env.PROMPTPAY_RECEIVER_ID) {
    const normalized = normalizePromptPayReceiver(env.PROMPTPAY_RECEIVER_ID);
    const sampleQr = generatePromptPayPayload(env.PROMPTPAY_RECEIVER_ID, 49, 'DME-CHECK');
    console.log(
      `\n[PASS] PromptPay QR test (${normalized.kind}: ${normalized.maskedDisplay}) -> EMVCo payload ${sampleQr.length} chars, CRC16 ok`
    );
  }

  if (report.missingForProduction.length > 0) {
    console.log('\nMissing or incomplete for Production:');
    for (const item of report.missingForProduction) {
      console.log(`  - ${item}`);
    }
  } else {
    console.log('\n[PASS] All local .env.local keys for Production are configured.');
  }

  let liveOk = true;
  if (live) {
    const liveResult = await runLiveSupabaseChecks(env);
    liveOk = liveResult.allPassed;
  } else {
    console.log('\nTip: after saving .env.local and running supabase/ALL_IN_ONE_SETUP.sql, run:');
    console.log('     npm run check:prod -- --live');
  }

  if ((strict || report.billingMode === 'production') && (!report.productionReady || (live && !liveOk))) {
    process.exit(1);
  }
}

void main();
