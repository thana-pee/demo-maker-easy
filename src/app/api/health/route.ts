import { NextResponse } from 'next/server';
import { evaluateProductionReadiness } from '@/lib/productionReadiness';

export function handleHealthRequest(env: Record<string, string | undefined> = process.env) {
  const report = evaluateProductionReadiness(env);
  return NextResponse.json({
    ok: true,
    ...report,
  });
}

export async function GET() {
  return handleHealthRequest();
}
