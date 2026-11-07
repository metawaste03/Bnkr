import { useState, type FormEvent } from 'react';
import { CountInput, Field, MoneyInput, Row } from '../components/common';
import { useApp, useMoney } from '../context';
import { saveClosing, skipClosing, updateClosingReasons } from '../db';
import {
  cashCheck,
  debtTotals,
  foodCheck,
  salesTotals,
  missingFoodValue,
  missingPortions,
  portionsSold,
} from '../lib/calculations';
import { formatDay, formatWeekday } from '../lib/dates';
import type { CashReason, Closing as ClosingRow, FoodReason } from '../lib/types';
import { t } from '../strings';

function ReasonSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Record<T, string>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <Field label={t.checks.reason}>
      {(id) => (
        <select
          id={id}
          className="input"
          value={value ?? ''}
          onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
        >
          <option value="">{t.checks.noReason}</option>
          {(Object.entries(options) as [T, string][]).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function Verdict({ tone, children }: { tone: 'ok' | 'short' | 'extra'; children: string }) {
  return <p className={`verdict ${tone}`}>{children}</p>;
}

/** The food and cash comparison for a closed day. Shared by the closing flow and the day view. */
export function DayChecks({ date, closing }: { date: string; closing: ClosingRow }) {
  const { data } = useApp();
  const money = useMoney();
  const day = data.days.find((d) => d.date === date);
  if (!day) return null;

  const orders = data.orders.filter((o) => o.date === date);
  const cashOuts = data.cashOuts.filter((c) => c.date === date);
  const payments = data.debtPayments.filter((p) => p.date === date);
  const food = foodCheck(day, orders, closing);
  const cash = cashCheck(day, orders, cashOuts, closing, payments);
  const transferSales = salesTotals(orders).transfer;
  const debtTransfers = debtTotals(payments).transfer;
  const transfers = transferSales + debtTransfers;

  const missing = food ? missingPortions(food) : 0;
  const extraFood = food ? food.reduce((sum, r) => sum + Math.max(0, r.diff), 0) : 0;
  const hasGap = missing > 0 || (cash !== null && cash.diff !== 0) || extraFood > 0;
  const dishName = (id: string) => data.dishes.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="stack">
      {!food && !cash && <p className="card">{t.checks.notCounted}</p>}

      {food && (
        <section className="card stack-sm">
          <h2>{t.checks.foodTitle}</h2>
          {food.filter((row) => row.available > 0 || row.sold > 0).map((row) => (
            <Row
              key={row.dishId}
              label={dishName(row.dishId)}
              value={
                <>
                  {t.checks.expected} {row.expectedLeft} · {t.checks.counted} {row.counted}
                </>
              }
            />
          ))}
          {missing > 0 ? (
            <Verdict tone="short">{t.checks.foodMissing(missing, money.format(missingFoodValue(food, data.dishes)))}</Verdict>
          ) : extraFood > 0 ? (
            <Verdict tone="extra">{t.checks.foodExtra(extraFood)}</Verdict>
          ) : (
            <Verdict tone="ok">{t.checks.matches}</Verdict>
          )}
          {(missing > 0 || extraFood > 0) && (
            <ReasonSelect<FoodReason>
              options={t.checks.foodReasons}
              value={closing.foodReason}
              onChange={(foodReason) =>
                updateClosingReasons(date, { foodReason, cashReason: closing.cashReason })
              }
            />
          )}
        </section>
      )}

      {cash && (
        <section className="card stack-sm">
          <h2>{t.checks.cashTitle}</h2>
          <Row label={t.checks.opening} value={money.format(cash.opening)} />
          <Row label={t.checks.cashSales} value={`+ ${money.format(cash.cashSales)}`} />
          {cash.debtCash > 0 && <Row label={t.checks.debtCash} value={`+ ${money.format(cash.debtCash)}`} />}
          {cash.cashOut > 0 && <Row label={t.checks.cashOut} value={`− ${money.format(cash.cashOut)}`} />}
          <Row label={t.checks.expectedCash} value={money.format(cash.expected)} strong />
          <Row label={t.checks.countedCash} value={money.format(cash.counted)} strong />
          {cash.diff < 0 ? (
            <Verdict tone="short">{t.checks.cashMissing(money.format(-cash.diff))}</Verdict>
          ) : cash.diff > 0 ? (
            <Verdict tone="extra">{t.checks.cashExtra(money.format(cash.diff))}</Verdict>
          ) : (
            <Verdict tone="ok">{t.checks.matches}</Verdict>
          )}
          {cash.diff !== 0 && (
            <ReasonSelect<CashReason>
              options={t.checks.cashReasons}
              value={closing.cashReason}
              onChange={(cashReason) =>
                updateClosingReasons(date, { cashReason, foodReason: closing.foodReason })
              }
            />
          )}
        </section>
      )}

      {hasGap && <p className="hint">{t.checks.explain}</p>}

      {transfers > 0 && (
        <section className="card stack-sm">
          <Row label={t.checks.transfersTitle} value={money.format(transfers)} strong />
          {debtTransfers > 0 && (
            <>
              <Row label={t.checks.transferSales} value={money.format(transferSales)} />
              <Row label={t.checks.debtTransfer} value={money.format(debtTransfers)} />
            </>
          )}
          <p className="hint">{t.checks.transfersHint}</p>
        </section>
      )}
    </div>
  );
}

export function Closing({
  date,
  forgotten,
  onDone,
}: {
  date: string;
  /** True when the app is asking her to close an earlier day she didn't close. */
  forgotten: boolean;
  onDone: () => void;
}) {
  const { data } = useApp();
  const money = useMoney();
  const day = data.days.find((d) => d.date === date);
  const closing = data.closings.find((c) => c.date === date);
  const [showResults, setShowResults] = useState(false);

  const [cash, setCash] = useState(
    closing?.countedCashMinor != null ? money.toInput(closing.countedCashMinor) : '',
  );
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(closing?.portionsLeft ?? {}).map(([id, n]) => [id, String(n)])),
  );
  const [error, setError] = useState<string | null>(null);

  if (!day) return null;

  const sold = portionsSold(data.orders.filter((o) => o.date === date));
  const dishIds = [...new Set([...Object.keys(day.portions), ...Object.keys(sold)])].filter(
    (id) => (day.portions[id] ?? 0) > 0 || (sold[id] ?? 0) > 0,
  );
  const dishName = (id: string) => data.dishes.find((d) => d.id === id)?.name ?? id;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const counted = money.parse(cash);
    if (counted === null) return setError(t.closing.needCash);
    if (dishIds.some((id) => !counts[id])) return setError(t.closing.needPortions);
    const left = Object.fromEntries(dishIds.map((id) => [id, Number(counts[id])]));
    await saveClosing(date, counted, left);
    setShowResults(true);
  };

  const closeWithoutCount = async () => {
    if (!window.confirm(t.closing.noCountConfirm)) return;
    await skipClosing(date);
    onDone();
  };

  if (showResults && closing) {
    return (
      <main className="screen stack">
        <p className="eyebrow">{formatDay(date)}</p>
        <h1>{t.closing.resultsTitle}</h1>
        <DayChecks date={date} closing={closing} />
        <button className="btn primary big" onClick={onDone}>
          {t.common.done}
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <p className="eyebrow">{formatDay(date)}</p>
      <h1>{forgotten ? t.closing.forgotTitle(formatWeekday(date)) : t.closing.title}</h1>
      {forgotten && <p className="lead">{t.closing.forgotHint}</p>}
      <form className="stack" onSubmit={submit}>
        <section className="card stack-sm">
          <h2>{t.closing.cashTitle}</h2>
          <Field label={t.closing.cashLabel} hint={t.closing.cashHint}>
            {(id) => <MoneyInput id={id} value={cash} onChange={setCash} />}
          </Field>
        </section>
        <section className="card stack-sm">
          <h2>{t.closing.portionsTitle}</h2>
          {dishIds.map((id) => (
            <div className="count-row" key={id}>
              <Field label={dishName(id)}>
                {(inputId) => (
                  <CountInput
                    id={inputId}
                    value={counts[id] ?? ''}
                    onChange={(value) => setCounts((c) => ({ ...c, [id]: value }))}
                  />
                )}
              </Field>
            </div>
          ))}
        </section>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big">{t.closing.save}</button>
        {forgotten ? (
          <button type="button" className="btn ghost" onClick={closeWithoutCount}>
            {t.closing.noCount}
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={onDone}>
            {t.common.cancel}
          </button>
        )}
      </form>
    </main>
  );
}
