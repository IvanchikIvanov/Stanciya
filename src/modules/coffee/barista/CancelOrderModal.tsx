'use client';

import React, { useState } from 'react';
import { STAFF_CANCEL_REASONS } from '../orders/constants';

interface CancelOrderModalProps {
  orderNumber: number;
  onClose: () => void;
  onConfirm: (reason: string, comment: string) => Promise<void>;
}

const REASON_ENTRIES = Object.entries(STAFF_CANCEL_REASONS);

export function CancelOrderModal({
  orderNumber,
  onClose,
  onConfirm,
}: CancelOrderModalProps) {
  const [reason, setReason] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm =
    Boolean(reason) && (reason !== 'other' || comment.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canConfirm || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(reason, comment.trim());
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить, повторите');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div
        className="bg-white rounded-panel shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="cancel-modal-title" className="text-lg font-extrabold text-slate-900">
            Отмена заказа №{orderNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Выберите обязательную причину отмены заказа:
        </p>

        {error && (
          <div className="p-3 rounded-btn bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            {REASON_ENTRIES.map(([code, label]) => (
              <label
                key={code}
                className={`flex items-center gap-3 p-3 rounded-btn border cursor-pointer text-sm font-semibold transition ${
                  reason === code
                    ? 'bg-red-50 border-red-400 text-red-900'
                    : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  value={code}
                  checked={reason === code}
                  onChange={() => setReason(code)}
                  className="w-4 h-4 text-red-600"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {reason === 'other' && (
            <div>
              <label
                htmlFor="cancel-other-comment"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Укажите причину отмены *
              </label>
              <textarea
                id="cancel-other-comment"
                rows={2}
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Опишите причину отмены для гостя"
                className="w-full px-3.5 py-2 rounded-btn border border-slate-300 text-sm"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
            >
              Назад
            </button>
            <button
              type="submit"
              disabled={!canConfirm || submitting}
              className="min-h-[44px] px-5 py-2.5 rounded-btn bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-sm transition"
            >
              {submitting ? 'Отменяем...' : 'Подтвердить отмену'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
