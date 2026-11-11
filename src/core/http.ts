import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './errors';

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
      },
    },
    { status }
  );
}

export function handleApiError(err: unknown) {
  if (err instanceof AppError) {
    return apiError(err.status, err.code, err.message, err.fields);
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) {
        fields[key] = issue.message;
      }
    }
    const firstMsg = err.issues[0]?.message || 'Проверьте правильность заполнения полей';
    return apiError(400, 'VALIDATION_ERROR', firstMsg, fields);
  }

  console.error('Unhandled API Error:', err);
  return apiError(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}
