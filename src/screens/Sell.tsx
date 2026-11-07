import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Field, MoneyInput } from '../components/common';
import { useApp, useMoney } from '../context';
import { addCashOut, addOrder, voidOrder } from '../db';
import { portionsSold } from '../lib/calculations';
import { formatDay } from '../lib/dates';
import type { Dish, Payment } from '../lib/types';
import { t } from '../strings';

/** The sale form: tap dishes, then tap Cash or Transfer to save. Used live and for missed sales. */
export function SaleForm({ date, onSaved }: { date: string; onSaved?: () => void }) {
  const { data } = useApp();
  const money = useMoney();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [override, setOverride] = useState<string | null>(null);
  const [toast, setToast] = useState<{ orderId: string | null; text: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const dishes = data.dishes.filter((d) => d.active);
  const day = data.days.find((d) => d.date === date);
  const dayOrders = useMemo(() => data.orders.filter((o) => o.date === date), [data.orders, date]);
  const sold = portionsSold(dayOrders);
  const nextCustomer = dayOrders.reduce((max, o) => Math.max(max, o.customerNumber), 0) + 1;

  const listTotal = dishes.reduce((sum, d) => sum + (cart[d.id] ?? 0) * d.priceMinor, 0);
  const portionCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const overrideMinor = override === null ? null : money.parse(override);
  const amount = override === null ? listTotal : overrideMinor;
  const canSave = portionCount > 0 && amount !== null;

  const change = (dish: Dish, delta: number) =>
    setCart((c) => ({ ...c, [dish.id]: Math.max(0, (c[dish.id] ?? 0) + delta) }));

  const showToast = (text: string, orderId: string | null) => {
    setToast({ text, orderId });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  };

  const save = async (payment: Payment) => {
    if (!canSave || amount === null) return;
    const lines = dishes
      .filter((d) => (cart[d.id] ?? 0) > 0)
      .map((d) => ({ dishId: d.id, qty: cart[d.id], unitPriceMinor: d.priceMinor }));
    const order = await addOrder(date, lines, amount, payment);
    setCart({});
    setOverride(null);
    showToast(t.sell.saved(order.customerNumber), order.id);
    onSaved?.();
  };

  const undo = async () => {
    if (!toast?.orderId) return;
    await voidOrder(toast.orderId);
    showToast(t.sell.undone, null);
  };

  return (
    <div className="stack-sm">
      <div className="sale-head">
        <h2>{t.sell.customer(nextCustomer)}</h2>
        {portionCount === 0 && <p className="hint">{t.sell.tapDish}</p>}
      </div>

      <div className="dish-grid">
        {dishes.map((dish) => {
          const qty = cart[dish.id] ?? 0;
          const remaining = (day?.portions[dish.id] ?? 0) - (sold[dish.id] ?? 0) - qty;
          return (
            <div className={qty > 0 ? 'dish selected' : 'dish'} key={dish.id}>
              <button type="button" className="dish-main" onClick={() => change(dish, 1)}>
                <span className="dish-name">{dish.name}</span>
                <span className="dish-meta">
                  {money.format(dish.priceMinor)} · {t.sell.left(remaining)}
                </span>
              </button>
              {qty > 0 && (
                <div className="dish-qty">
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label={t.sell.decrease(dish.name)}
                    onClick={() => change(dish, -1)}
                  >
                    −
                  </button>
                  <span className="qty num" aria-live="polite">{qty}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card checkout">
        {override === null ? (
          <div className="row strong">
            <span>{t.sell.total}</span>
            <span className="num total">{money.format(listTotal)}</span>
          </div>
        ) : (
          <Field label={t.sell.amountPaid}>
            {(id) => <MoneyInput id={id} value={override} onChange={setOverride} />}
          </Field>
        )}
        {portionCount > 0 && (
          <button
            type="button"
            className="link"
            onClick={() => setOverride(override === null ? money.toInput(listTotal) : null)}
          >
            {override === null ? t.sell.changeAmount : t.sell.useListPrice}
          </button>
        )}
        {override !== null && overrideMinor === null && <p className="error">{t.common.invalidAmount}</p>}
        <div className="pay-buttons">
          <button type="button" className="btn primary big" disabled={!canSave} onClick={() => save('cash')}>
            {t.sell.cash}
          </button>
          <button type="button" className="btn transfer big" disabled={!canSave} onClick={() => save('transfer')}>
            {t.sell.transfer}
          </button>
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.orderId && (
            <button type="button" className="link on-dark" onClick={undo}>
              {t.sell.undo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CashOutForm({ date, onClose }: { date: string; onClose: () => void }) {
  const money = useMoney();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const minor = money.parse(amount);
    if (minor === null || minor === 0) return setError(t.common.invalidAmount);
    await addCashOut(date, minor, note.trim());
    onClose();
  };

  return (
    <form className="card stack-sm" onSubmit={submit}>
      <h2>{t.cashOut.title}</h2>
      <p className="hint">{t.cashOut.hint}</p>
      <Field label={t.common.amount}>
        {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}
      </Field>
      <Field label={t.cashOut.note}>
        {(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button className="btn secondary">{t.common.save}</button>
      </div>
    </form>
  );
}

export function Sell({
  onOpenToday,
  onClose,
  onViewToday,
}: {
  onOpenToday: () => void;
  onClose: () => void;
  onViewToday: () => void;
}) {
  const { data, today } = useApp();
  const [showCashOut, setShowCashOut] = useState(false);
  const day = data.days.find((d) => d.date === today);
  const closed = data.closings.some((c) => c.date === today);

  if (!day) {
    return (
      <main className="screen center">
        <p className="eyebrow">{formatDay(today)}</p>
        <p className="lead">{t.morning.notOpened}</p>
        <button className="btn primary big" onClick={onOpenToday}>
          {t.morning.openToday}
        </button>
      </main>
    );
  }

  if (closed) {
    return (
      <main className="screen center">
        <p className="eyebrow">{formatDay(today)}</p>
        <p className="lead">{t.sell.closed}</p>
        <button className="btn secondary big" onClick={onViewToday}>
          {t.tabs.today}
        </button>
      </main>
    );
  }

  return (
    <main className="screen stack">
      <p className="eyebrow">{formatDay(today)}</p>
      <SaleForm date={today} />
      {showCashOut ? (
        <CashOutForm date={today} onClose={() => setShowCashOut(false)} />
      ) : (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => setShowCashOut(true)}>
            {t.cashOut.button}
          </button>
          <button className="btn secondary" onClick={onClose}>
            {t.day.closeDay}
          </button>
        </div>
      )}
    </main>
  );
}
