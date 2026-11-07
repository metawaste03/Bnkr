import { useMemo, useState } from 'react';
import { ExpenseEntry, Row, useExpenseDraft } from '../components/common';
import { useApp, useMoney } from '../context';
import { addExpense, removeExpense } from '../db';
import { openDebts, pointers, previousWeek, weekSummary, type Pointer } from '../lib/calculations';
import { addDays, formatDay, formatShortDate, formatWeekday, inWeek, weekStart } from '../lib/dates';
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

export function Week({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { data, today } = useApp();
  const money = useMoney();
  const currentWeek = weekStart(today);
  const [start, setStart] = useState(currentWeek);
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

      {week.days.length > 0 && (
        <section className="card stack-sm">
          <h2>{t.week.days}</h2>
          <ul className="day-list">
            {week.days.map((row) => {
              const hasGap = (row.cashDiff !== null && row.cashDiff !== 0) || (row.missing ?? 0) > 0;
              const skipped = row.closed && row.cashDiff === null;
              const status = !row.closed
                ? t.week.notClosed
                : skipped
                  ? t.week.notCounted
                  : hasGap
                    ? t.week.gap
                    : t.week.balanced;
              return (
                <li key={row.date}>
                  <button className="day-row" onClick={() => onOpenDay(row.date)}>
                    <span className="day-row-main">
                      <strong>{formatDay(row.date)}</strong>
                      <span className={hasGap ? 'hint warn-text' : 'hint'}>{status}</span>
                    </span>
                    <span className="num">{money.format(row.profit)} ›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
