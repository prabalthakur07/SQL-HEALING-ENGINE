import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { runHealingLoop } from '@/lib/healingEngine';
import { isAuthorized } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const requestId = randomUUID();

  if (!isAuthorized(req)) {
    logger.warn('unauthorized_request', { requestId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    logger.warn('rate_limited', { requestId, ip });
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  try {
    const { question, allowWrites } = await req.json();

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json({ error: 'A "question" string is required.' }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ error: 'Question is too long (max 2000 characters).' }, { status: 400 });
    }

    logger.info('query_received', { requestId, ip, questionLength: question.length });

    const result = await runHealingLoop(question.trim(), Boolean(allowWrites), requestId);
    return NextResponse.json(
      { ...result, requestId },
      { headers: { 'X-RateLimit-Remaining': String(remaining) } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    logger.error('unhandled_error', { requestId, error: message });
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  }
}
