import { useState } from 'react';
import { ExpenseEntry, Row, useExpenseDraft } from '../components/common';
import { useApp, useMoney } from '../context';
import { addExpense, removeCashOut, removeExpense, voidOrder } from '../db';
import { dayNumbers, portionsSold } from '../lib/calculations';
import { formatDay, formatTime } from '../lib/dates';
import type { Order } from '../lib/types';
import { t } from '../strings';
import { DayChecks } from './Closing';
import { useExpenseSuggestions } from './Morning';
import { SaleForm } from './Sell';

function SaleRow({ order }: { order: Order }) {
  const { data } = useApp();
  const money = useMoney();
  const summary = order.lines
    .map((l) => `${l.qty} × ${data.dishes.find((d) => d.id === l.dishId)?.name ?? l.dishId}`)
    .join(', ');
  const voided = order.voidedAt !== undefined;

  return (
    <li className={voided ? 'sale voided' : 'sale'}>
      <div className="sale-line">
        <strong>#{order.customerNumber}</strong>
        <span className="sale-items">{summary}</span>
        <span className="num">{money.format(order.amountMinor)}</span>
      </div>
      <div className="sale-line sub">
        <span>
          {formatTime(order.createdAt)} · {order.payment === 'cash' ? t.sell.cash : t.sell.transfer}
          {voided && ` · ${t.day.voided(formatTime(order.voidedAt!))}`}
        </span>
        {!voided && (
          <button
            className="link danger"
            onClick={() => {
              if (window.confirm(t.day.voidConfirm(order.customerNumber))) void voidOrder(order.id);
            }}
          >
            {t.day.removeSale}
          </button>
        )}
      </div>
    </li>
  );
}

export function DayView({
  date,
  onBack,
  onOpenToday,
  onClose,
  onEditMorning,
}: {
  date: string;
  onBack?: () => void;
  onOpenToday: () => void;
  onClose: (date: string) => void;
  onEditMorning: (date: string) => void;
}) {
  const { data } = useApp();
  const money = useMoney();
  const [addingSale, setAddingSale] = useState(false);
  const draft = useExpenseDraft();
  const suggestions = useExpenseSuggestions('daily');

  const day = data.days.find((d) => d.date === date);
  const closing = data.closings.find((c) => c.date === date);

  if (!day) {
    return (
      <main className="screen center">
        <p className="eyebrow">{formatDay(date)}</p>
        <p className="lead">{t.morning.notOpened}</p>
        <button className="btn primary big" onClick={onOpenToday}>
          {t.morning.openToday}
        </button>
      </main>
    );
  }

  const orders = data.orders
    .filter((o) => o.date === date)
    .sort((a, b) => b.customerNumber - a.customerNumber);
  const expenses = data.expenses.filter((e) => e.date === date && e.kind === 'daily');
  const cashOuts = data.cashOuts.filter((c) => c.date === date);
  const numbers = dayNumbers(orders, expenses);
  const sold = portionsSold(orders);
  const dishIds = [...new Set([...Object.keys(day.portions), ...Object.keys(sold)])].filter(
    (id) => (day.portions[id] ?? 0) > 0 || (sold[id] ?? 0) > 0,
  );

  const addDraft = () => {
    const entry = draft.take();
    if (entry && entry !== 'invalid') void addExpense('daily', date, entry.name, entry.amountMinor);
  };

  return (
    <main className="screen stack">
      {onBack && (
        <button className="link back" onClick={onBack}>
          ‹ {t.common.back}
        </button>
      )}
      <p className="eyebrow">{formatDay(date)}</p>

      <section className="card stack-sm">
        <div className="hero-number">
          <span className="hero-label">{t.day.result}</span>
          <span className={numbers.profit < 0 ? 'hero-value bad num' : 'hero-value num'}>
            {money.format(numbers.profit)}
          </span>
          <span className="hint">{t.day.beforeWeekly}</span>
        </div>
        <Row label={t.day.sales} value={money.format(numbers.total)} strong />
        <Row label={t.day.cash} value={money.format(numbers.cash)} />
        <Row label={t.day.transfers} value={money.format(numbers.transfer)} />
        <Row label={t.day.costs} value={`− ${money.format(numbers.costs)}`} />
      </section>

      {closing ? (
        <DayChecks date={date} closing={closing} />
      ) : (
        <button className="btn primary big" onClick={() => onClose(date)}>
          {t.day.closeDay}
        </button>
      )}

      <section className="card stack-sm">
        <h2>{t.day.dishes}</h2>
        {dishIds.map((id) => (
          <Row
            key={id}
            label={data.dishes.find((d) => d.id === id)?.name ?? id}
            value={t.day.soldOf(sold[id] ?? 0, day.portions[id] ?? 0)}
          />
        ))}
      </section>

      <section className="card stack-sm">
        <h2>{t.day.listTitle}</h2>
        {expenses.length === 0 && <p className="hint">{t.day.listEmpty}</p>}
        {expenses.map((e) => (
          <div className="row" key={e.id}>
            <span>{e.name}</span>
            <span className="row-end">
              <span className="num">{money.format(e.amountMinor)}</span>
              <button
                className="link danger"
                onClick={() => {
                  if (window.confirm(t.day.removeItemConfirm(e.name))) void removeExpense(e.id);
                }}
              >
                {t.common.remove}
              </button>
            </span>
          </div>
        ))}
        <ExpenseEntry
          name={draft.name}
          amount={draft.amount}
          onName={draft.setName}
          onAmount={draft.setAmount}
          onAdd={addDraft}
          suggestions={suggestions}
          error={draft.error}
        />
      </section>

      {cashOuts.length > 0 && (
        <section className="card stack-sm">
          <h2>{t.day.cashOuts}</h2>
          {cashOuts.map((c) => (
            <div className="row" key={c.id}>
              <span>{c.note || formatTime(c.createdAt)}</span>
              <span className="row-end">
                <span className="num">{money.format(c.amountMinor)}</span>
                <button
                  className="link danger"
                  onClick={() => {
                    if (window.confirm(t.day.removeItemConfirm(money.format(c.amountMinor)))) {
                      void removeCashOut(c.id);
                    }
                  }}
                >
                  {t.common.remove}
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card stack-sm">
        <h2>{t.day.history}</h2>
        {orders.length === 0 && <p className="hint">{t.day.historyEmpty}</p>}
        <ul className="sales">
          {orders.map((order) => (
            <SaleRow key={order.id} order={order} />
          ))}
        </ul>
      </section>

      {addingSale ? (
        <section className="card stack-sm">
          <p className="hint">{t.sell.addingTo(formatDay(date))}</p>
          <SaleForm date={date} />
          <button className="btn ghost" onClick={() => setAddingSale(false)}>
            {t.common.done}
          </button>
        </section>
      ) : (
        <button className="btn ghost" onClick={() => setAddingSale(true)}>
          {t.day.addMissed}
        </button>
      )}

      <button className="btn ghost" onClick={() => onEditMorning(date)}>
        {t.day.editMorning}
      </button>
      {closing && (
        <button className="btn ghost" onClick={() => onClose(date)}>
          {closing.skipped ? t.day.addCount : t.day.redoCount}
        </button>
      )}
    </main>
  );
}
