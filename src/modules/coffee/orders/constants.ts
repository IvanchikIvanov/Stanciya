export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'cooking'
  | 'ready'
  | 'done'
  | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  accepted: 'Принят',
  cooking: 'Готовится',
  ready: 'Готов',
  done: 'Выдан',
  cancelled: 'Отменён',
};

export const STAFF_CANCEL_REASONS: Record<string, string> = {
  no_show: 'Гость не пришёл',
  out_of_stock: 'Нет позиции',
  point_closed: 'Точка закрыта',
  guest_request: 'По просьбе гостя',
  other: 'Другое',
};
