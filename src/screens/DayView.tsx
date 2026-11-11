import { useState } from 'react';
import { ExpenseEntry, Row, useExpenseDraft } from '../components/common';
import { useApp, useMoney } from '../context';
import { addExpense, removeCashOut, removeExpense, voidOrder } from '../db';
import { dayNumbers, debtFor, portionsSold } from '../lib/calculations';
import { formatDay, formatTime } from '../lib/dates';
import type { Order } from '../lib/types';
import { t } from '../strings';
import { DayChecks } from './Closing';
import { useExpenseSuggestions } from './Morning';
import { OwedButton, orderSummary } from './Owed';
import { SaleForm } from './Sell';

function SaleRow({ order }: { order: Order }) {
  const { data } = useApp();
  const money = useMoney();
  const voided = order.voidedAt !== undefined;
  const debt = order.payment === 'credit' ? debtFor(order, data.debtPayments) : null;
  const hasPayments = data.debtPayments.some((p) => p.orderId === order.id);

  const method =
    order.payment === 'cash'
      ? t.sell.cash
      : order.payment === 'transfer'
        ? t.sell.transfer
        : t.day.creditLabel(order.customerName ?? '');
  const debtStatus =
    debt && !voided
      ? debt.remaining > 0
        ? t.day.stillOwed(money.format(debt.remaining))
        : debt.writtenOff > 0
          ? t.day.wontBePaid
          : t.day.paidInFull
      : null;

  return (
    <li className={voided ? 'sale voided' : 'sale'}>
      <div className="sale-line">
        <strong>#{order.customerNumber}</strong>
        <span className="sale-items">{orderSummary(order, data.dishes)}</span>
        <span className="num">{money.format(order.amountMinor)}</span>
      </div>
      <div className="sale-line sub">
        <span>
          {formatTime(order.createdAt)} · {method}
          {debtStatus && ` · ${debtStatus}`}
          {voided && ` · ${t.day.voided(formatTime(order.voidedAt!))}`}
        </span>
        {!voided && !hasPayments && (
          <button
            className="link danger"
            onClick={() => {
              if (window.confirm(t.day.voidConfirm(order.customerNumber))) {
                void voidOrder(order.id).then((ok) => ok || window.alert(t.day.cantRemove));
              }
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
  onOpenOwed,
}: {
  date: string;
  onBack?: () => void;
  onOpenToday: () => void;
  onClose: (date: string) => void;
  onEditMorning: (date: string) => void;
  onOpenOwed: () => void;
}) {
  const { data, today } = useApp();
  const money = useMoney();
  const [addingSale, setAddingSale] = useState(false);
  const draft = useExpenseDraft();
  const suggestions = useExpenseSuggestions('daily');

  const day = data.days.find((d) => d.date === date);
  const closing = data.closings.find((c) => c.date === date);
  // Debts can be paid on any day, even one she didn't open. Only a button here, so earlier
  // customers never appear as if they were today's entries.
  const owedList = date === today ? <OwedButton onOpen={onOpenOwed} /> : null;

  if (!day) {
    return (
      <main className="screen stack">
        <div className="screen center">
          <p className="eyebrow">{formatDay(date)}</p>
          <p className="lead">{t.morning.notOpened}</p>
          <button className="btn primary big" onClick={onOpenToday}>
            {t.morning.openToday}
          </button>
        </div>
        {owedList}
      </main>
    );
  }

  const orders = data.orders
    .filter((o) => o.date === date)
    .sort((a, b) => b.customerNumber - a.customerNumber);
  const expenses = data.expenses.filter((e) => e.date === date && e.kind === 'daily');
  const cashOuts = data.cashOuts.filter((c) => c.date === date);
  const payments = data.debtPayments.filter((p) => p.date === date);
  const numbers = dayNumbers(orders, expenses, payments);
  const debtsPaid = numbers.debtCash + numbers.debtTransfer;
  // "Today's list" would be misleading on an earlier day.
  const listLabel = date === today ? t.day.listTitle : t.week.dayList;
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
        {numbers.credit > 0 && <Row label={t.day.payLater} value={money.format(numbers.credit)} />}
        <Row label={listLabel} value={`− ${money.format(numbers.costs)}`} />
        {numbers.writtenOff > 0 && <Row label={t.day.writtenOff} value={`− ${money.format(numbers.writtenOff)}`} />}
        {debtsPaid > 0 && (
          <>
            <Row label={date === today ? t.day.debtsPaid : t.week.dayDebtsPaid} value={money.format(debtsPaid)} />
            <p className="hint">{t.day.debtsPaidHint}</p>
          </>
        )}
      </section>

      {owedList}

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
        <h2>{listLabel}</h2>
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
