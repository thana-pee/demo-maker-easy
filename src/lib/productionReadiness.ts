import { normalizeGeminiModel } from './geminiClient';
import { normalizePromptPayReceiver } from './promptpayQr';

export interface ProductionReadinessChecks {
  geminiApiKey: boolean;
  supabaseUrl: boolean;
  supabaseAnonKey: boolean;
  supabaseServiceRoleKey: boolean;
  supabaseKeysDistinct: boolean;
  promptPayReceiverId: boolean;
  promptPayReceiverValid: boolean;
  promptPayReceiverName: boolean;
  slipVerifyApiUrl: boolean;
  slipVerifyApiKey: boolean;
}

export interface ProductionReadinessReport {
  billingMode: 'standalone' | 'production';
  geminiModel: string;
  productionReady: boolean;
  cloudAuthReady: boolean;
  billingReady: boolean;
  checks: ProductionReadinessChecks;
  missingForProduction: string[];
}

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * ตรวจสอบความพร้อมของ Environment Variables สำหรับโหมด Production
 * โดยไม่เปิดเผยค่า Secret จริงออกไปในผลลัพธ์
 */
export function evaluateProductionReadiness(
  env: Record<string, string | undefined> = process.env
): ProductionReadinessReport {
  const geminiKey = (env.GEMINI_API_KEY || '').trim();
  const geminiModel = normalizeGeminiModel(env.GEMINI_MODEL);
  const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const supabaseServiceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const promptPayReceiverId = (env.PROMPTPAY_RECEIVER_ID || '').trim();
  const promptPayReceiverName = (env.PROMPTPAY_RECEIVER_NAME || '').trim();
  const slipVerifyApiUrl = (env.SLIP_VERIFY_API_URL || '').trim();
  const slipVerifyApiKey = (env.SLIP_VERIFY_API_KEY || '').trim();
  const billingMode: 'standalone' | 'production' =
    (env.NEXT_PUBLIC_BILLING_MODE || '').trim().toLowerCase() === 'production'
      ? 'production'
      : 'standalone';

  let promptPayReceiverValid = false;
  if (promptPayReceiverId) {
    try {
      normalizePromptPayReceiver(promptPayReceiverId);
      promptPayReceiverValid = true;
    } catch {
      promptPayReceiverValid = false;
    }
  }

  const supabaseKeysDistinct =
    !supabaseAnonKey || !supabaseServiceRoleKey || supabaseAnonKey !== supabaseServiceRoleKey;

  const checks: ProductionReadinessChecks = {
    geminiApiKey: Boolean(geminiKey),
    supabaseUrl: isHttpUrl(supabaseUrl),
    supabaseAnonKey: Boolean(supabaseAnonKey),
    supabaseServiceRoleKey: Boolean(supabaseServiceRoleKey),
    supabaseKeysDistinct,
    promptPayReceiverId: Boolean(promptPayReceiverId),
    promptPayReceiverValid,
    promptPayReceiverName: Boolean(promptPayReceiverName),
    slipVerifyApiUrl: isHttpUrl(slipVerifyApiUrl),
    slipVerifyApiKey: Boolean(slipVerifyApiKey),
  };

  const missingForProduction: string[] = [];
  if (!checks.geminiApiKey) missingForProduction.push('GEMINI_API_KEY');
  if (!checks.supabaseUrl) missingForProduction.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!checks.supabaseAnonKey) missingForProduction.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!checks.supabaseServiceRoleKey) {
    missingForProduction.push('SUPABASE_SERVICE_ROLE_KEY');
  } else if (!checks.supabaseKeysDistinct) {
    missingForProduction.push('SUPABASE_SERVICE_ROLE_KEY (must differ from NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }
  if (!checks.promptPayReceiverId || !checks.promptPayReceiverValid) {
    missingForProduction.push(
      checks.promptPayReceiverId && !checks.promptPayReceiverValid
        ? 'PROMPTPAY_RECEIVER_ID (invalid format: use 10, 13, or 15 digits)'
        : 'PROMPTPAY_RECEIVER_ID'
    );
  }
  if (!checks.promptPayReceiverName) missingForProduction.push('PROMPTPAY_RECEIVER_NAME');
  if (!checks.slipVerifyApiUrl) missingForProduction.push('SLIP_VERIFY_API_URL');
  if (!checks.slipVerifyApiKey) missingForProduction.push('SLIP_VERIFY_API_KEY');

  const cloudAuthReady = checks.supabaseUrl && checks.supabaseAnonKey;
  const billingReady =
    cloudAuthReady &&
    checks.supabaseServiceRoleKey &&
    checks.supabaseKeysDistinct &&
    checks.promptPayReceiverValid &&
    checks.promptPayReceiverName &&
    checks.slipVerifyApiUrl &&
    checks.slipVerifyApiKey;

  return {
    billingMode,
    geminiModel,
    productionReady: missingForProduction.length === 0,
    cloudAuthReady,
    billingReady,
    checks,
    missingForProduction,
  };
}
