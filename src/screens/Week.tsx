import { useMemo, useState } from 'react';
import { ExpenseEntry, Row, useExpenseDraft } from '../components/common';
import { useApp, useMoney } from '../context';
import { addExpense, removeExpense } from '../db';
import {
  activeOrders,
  cashCheck,
  dayNumbers,
  foodCheck,
  missingPortions,
  openDebts,
  pointers,
  portionsSold,
  previousWeek,
  weekSummary,
  type Pointer,
} from '../lib/calculations';
import {
  addDays,
  dayOfMonth,
  formatDay,
  formatShortDate,
  formatWeekday,
  formatWeekdayShort,
  inWeek,
  weekStart,
} from '../lib/dates';
import { t } from '../strings';
import { useExpenseSuggestions } from './Morning';

function pointerText(p: Pointer, format: (minor: number) => string): string {
  switch (p.id) {
    case 'cash-repeat':
      return t.pointers.cashRepeat(p.days, format(p.amount));
    case 'food-repeat':
      return t.pointers.foodRepeat(p.days, p.portions);
    case 'owed-old':
      return t.pointers.owedOld(p.count, format(p.amount));
    case 'repeat-debtor':
      return t.pointers.repeatDebtor(p.name, p.count, format(p.amount));
    case 'break-even':
      return t.pointers.breakEven(p.needed, p.average);
    case 'best-seller':
      return t.pointers.bestSeller(p.dish, p.sold);
    case 'most-unsold':
      return t.pointers.mostUnsold(p.dish, p.left);
    case 'best-day':
      return t.pointers.bestDay(formatWeekday(p.date), format(p.sales));
    case 'vs-last-week':
      if (p.change === 0) return t.pointers.same;
      return p.change > 0 ? t.pointers.up(format(p.change)) : t.pointers.down(format(-p.change));
  }
}

/** One day's numbers, shown under the day picker. */
function DayBreakdown({ date, onOpenDay }: { date: string; onOpenDay: (date: string) => void }) {
  const { data, today } = useApp();
  const money = useMoney();
  const name = formatDay(date);
  const day = data.days.find((d) => d.date === date);
  const orders = data.orders.filter((o) => o.date === date);
  const payments = data.debtPayments.filter((p) => p.date === date);
  const expenses = data.expenses.filter((e) => e.date === date && e.kind === 'daily');

  if (!day && orders.length === 0 && payments.length === 0 && expenses.length === 0) {
    return <p className="card">{date > today ? t.week.dayFuture(name) : t.week.dayNoRecords(name)}</p>;
  }

  const numbers = dayNumbers(orders, expenses, payments);
  const closing = data.closings.find((c) => c.date === date);
  const cash = day ? cashCheck(day, orders, data.cashOuts.filter((c) => c.date === date), closing, payments) : null;
  const food = day ? foodCheck(day, orders, closing) : null;
  const hasGap = (cash !== null && cash.diff !== 0) || (food !== null && missingPortions(food) > 0);
  const status = !closing
    ? t.week.notClosed
    : closing.skipped
      ? t.week.notCounted
      : hasGap
        ? t.week.gap
        : t.week.balanced;
  const sold = portionsSold(orders);
  const dishIds = [...new Set([...Object.keys(day?.portions ?? {}), ...Object.keys(sold)])].filter(
    (id) => (day?.portions[id] ?? 0) > 0 || (sold[id] ?? 0) > 0,
  );
  const debtsPaid = numbers.debtCash + numbers.debtTransfer;

  return (
    <section className="card stack-sm" aria-label={name}>
      <h2>{name}</h2>
      <p className={hasGap ? 'hint warn-text' : 'hint'}>
        {t.week.salesCount(activeOrders(orders).length)} · {status}
      </p>
      <div className="hero-number">
        <span className="hero-label">{t.week.dayResult}</span>
        <span className={numbers.profit < 0 ? 'hero-value bad num' : 'hero-value num'}>
          {money.format(numbers.profit)}
        </span>
        <span className="hint">{t.day.beforeWeekly}</span>
      </div>
      <Row label={t.day.sales} value={money.format(numbers.total)} strong />
      <Row label={t.day.cash} value={money.format(numbers.cash)} />
      <Row label={t.day.transfers} value={money.format(numbers.transfer)} />
      {numbers.credit > 0 && <Row label={t.day.payLater} value={money.format(numbers.credit)} />}
      <Row label={t.week.dayList} value={`− ${money.format(numbers.costs)}`} />
      {numbers.writtenOff > 0 && <Row label={t.day.writtenOff} value={`− ${money.format(numbers.writtenOff)}`} />}
      {debtsPaid > 0 && <Row label={t.week.dayDebtsPaid} value={money.format(debtsPaid)} />}
      {dishIds.length > 0 && <h3>{t.day.dishes}</h3>}
      {dishIds.map((id) => (
        <Row
          key={id}
          label={data.dishes.find((d) => d.id === id)?.name ?? id}
          value={t.day.soldOf(sold[id] ?? 0, day?.portions[id] ?? 0)}
        />
      ))}
      <button className="btn secondary" onClick={() => onOpenDay(date)}>
        {t.week.seeDetails}
      </button>
    </section>
  );
}

export function Week({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { data, today } = useApp();
  const money = useMoney();
  const currentWeek = weekStart(today);
  const [start, setStart] = useState(currentWeek);
  const [picked, setPicked] = useState<string | null>(null);
  const draft = useExpenseDraft();
  const suggestions = useExpenseSuggestions('weekly');

  const week = useMemo(() => weekSummary(data, start), [data, start]);
  const lastWeek = useMemo(() => weekSummary(data, previousWeek(start)), [data, start]);
  const open = useMemo(() => openDebts(data), [data]);
  const owedNow = open.reduce((sum, d) => sum + d.remaining, 0);
  const isCurrentWeek = start === currentWeek;
  const tips = isCurrentWeek ? pointers(week, lastWeek, open, today) : pointers(week, lastWeek);
  const weeklyItems = data.expenses.filter((e) => e.kind === 'weekly' && inWeek(e.date, start));
  const isEmpty = week.daysOpen === 0 && weeklyItems.length === 0;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const hasRecords = (date: string) =>
    data.days.some((d) => d.date === date) || data.orders.some((o) => o.date === date);
  // Today in the current week; otherwise the last day with records, or Monday.
  const defaultDay = inWeek(today, start)
    ? today
    : ([...weekDays].reverse().find(hasRecords) ?? start);
  const selected = picked && inWeek(picked, start) ? picked : defaultDay;

  const addDraft = () => {
    const entry = draft.take();
    if (entry && entry !== 'invalid') {
      void addExpense('weekly', inWeek(today, start) ? today : start, entry.name, entry.amountMinor);
    }
  };

  return (
    <main className="screen stack">
      <div className="week-nav">
        <button className="btn ghost small" aria-label={t.week.previous} onClick={() => setStart(addDays(start, -7))}>
          ‹
        </button>
        <h1>
          {start === currentWeek
            ? t.week.thisWeek
            : `${formatShortDate(start)} – ${formatShortDate(addDays(start, 6))}`}
        </h1>
        <button
          className="btn ghost small"
          aria-label={t.week.next}
          disabled={start === currentWeek}
          onClick={() => setStart(addDays(start, 7))}
        >
          ›
        </button>
      </div>

      <div className="day-picker" role="group" aria-label={t.week.pickDay}>
        {weekDays.map((date) => (
          <button
            key={date}
            className={date === selected ? 'day-chip selected' : 'day-chip'}
            aria-pressed={date === selected}
            aria-label={`${formatDay(date)}${hasRecords(date) ? `, ${t.week.hasRecords}` : ''}`}
            onClick={() => setPicked(date)}
          >
            <span className="day-chip-name">{formatWeekdayShort(date)}</span>
            <span className="day-chip-num">{dayOfMonth(date)}</span>
            <span className={hasRecords(date) ? 'day-chip-dot' : 'day-chip-dot empty'} aria-hidden="true" />
          </button>
        ))}
      </div>

      <DayBreakdown date={selected} onOpenDay={onOpenDay} />

      <h2 className="section-title">{t.week.wholeWeek}</h2>

      {isEmpty && <p className="card">{t.week.noData}</p>}

      {!isEmpty && (
        <section className="card stack-sm">
          <div className="hero-number">
            <span className="hero-label">{week.profit < 0 ? t.week.loss : t.week.profit}</span>
            <span className={week.profit < 0 ? 'hero-value bad num' : 'hero-value num'}>
              {money.format(Math.abs(week.profit))}
            </span>
            <span className="hint">{t.week.profitHint}</span>
          </div>
          <Row label={t.week.sales} value={money.format(week.sales)} strong />
          <Row label={t.week.dailyCosts} value={`− ${money.format(week.dailyCosts)}`} />
          <Row label={t.week.weeklyCosts} value={`− ${money.format(week.weeklyCosts)}`} />
          {week.writtenOff > 0 && <Row label={t.week.writtenOff} value={`− ${money.format(week.writtenOff)}`} />}
        </section>
      )}

      {tips.length > 0 && (
        <section className="stack-sm">
          <h2>{t.week.pointers}</h2>
          <ul className="pointers">
            {tips.map((p) => (
              <li key={p.id} className={`pointer ${p.tone}`}>
                {pointerText(p, money.format)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {week.perDish.length > 0 && (
        <section className="card stack-sm">
          <h2>{t.week.dishes}</h2>
          {week.perDish.map((row) => (
            <div className="dish-week" key={row.dish.id}>
              <Row label={row.dish.name} value={money.format(row.revenue)} strong />
              <p className="hint">{t.week.soldLeft(row.sold, row.left)}</p>
            </div>
          ))}
        </section>
      )}

      {week.daysOpen > 0 && (
        <section className="card stack-sm">
          <h2>{t.week.money}</h2>
          <Row label={t.week.cash} value={money.format(week.cash)} />
          <Row label={t.week.transfers} value={money.format(week.transfer)} />
          {week.credit > 0 && <Row label={t.week.payLater} value={money.format(week.credit)} />}
          {week.debtCash + week.debtTransfer > 0 && (
            <Row label={t.week.debtsPaid} value={money.format(week.debtCash + week.debtTransfer)} />
          )}
          {isCurrentWeek && owedNow > 0 && <Row label={t.week.owedNow} value={money.format(owedNow)} strong />}
          {week.avgCostPerPortion !== null && (
            <Row label={t.week.avgCost} value={money.format(week.avgCostPerPortion)} />
          )}
          <h3>{t.week.unaccounted}</h3>
          <Row label={t.week.unaccountedCash} value={money.format(week.cashUnaccounted)} />
          <Row label={t.week.unaccountedFood} value={week.portionsUnaccounted} />
        </section>
      )}

      <section className="card stack-sm">
        <h2>{t.week.weeklyList}</h2>
        <p className="hint">{t.week.weeklyHint}</p>
        {weeklyItems.length === 0 && <p className="hint">{t.week.weeklyEmpty}</p>}
        {weeklyItems.map((e) => (
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

    </main>
  );
}
