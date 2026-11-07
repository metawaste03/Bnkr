import { useMemo, useState, type FormEvent } from 'react';
import { CountInput, ExpenseEntry, Field, MoneyInput, useExpenseDraft } from '../components/common';
import { useApp, useMoney } from '../context';
import { saveMorning } from '../db';
import { formatDay } from '../lib/dates';
import { t } from '../strings';

/** Most recently used items, each with its latest amount. */
export function useExpenseSuggestions(kind: 'daily' | 'weekly') {
  const { data } = useApp();
  return useMemo(() => {
    const seen = new Map<string, { name: string; amountMinor: number }>();
    const newestFirst = data.expenses
      .filter((e) => e.kind === kind)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const e of newestFirst) {
      const key = e.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: e.name, amountMinor: e.amountMinor });
    }
    return [...seen.values()].slice(0, 8);
  }, [data.expenses, kind]);
}

export function Morning({
  date,
  onDone,
  onNotOpen,
}: {
  date: string;
  onDone: () => void;
  onNotOpen?: () => void;
}) {
  const { data } = useApp();
  const money = useMoney();
  const existing = data.days.find((d) => d.date === date);
  const dishes = data.dishes.filter((d) => d.active || existing?.portions[d.id] !== undefined);

  const [items, setItems] = useState<{ name: string; amountMinor: number }[]>([]);
  const draft = useExpenseDraft();
  const suggestions = useExpenseSuggestions('daily').filter(
    (s) => !items.some((i) => i.name.toLowerCase() === s.name.toLowerCase()),
  );
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(existing?.portions ?? {}).map(([id, n]) => [id, String(n)])),
  );
  const [cash, setCash] = useState(existing ? money.toInput(existing.openingCashMinor) : '');
  const [error, setError] = useState<string | null>(null);

  const addDraft = () => {
    const entry = draft.take();
    if (entry && entry !== 'invalid') setItems((rows) => [...rows, entry]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Include an item she typed but didn't press Add for.
    const pending = draft.take();
    if (pending === 'invalid') return;
    const allItems = pending ? [...items, pending] : items;
    if (pending) setItems(allItems);

    const portions = Object.fromEntries(dishes.map((d) => [d.id, Number(counts[d.id] || 0)]));
    if (Object.values(portions).every((n) => n === 0)) return setError(t.morning.needPortions);
    // Optional: an empty field means the till starts empty.
    const opening = cash.trim() ? money.parse(cash) : 0;
    if (opening === null) return setError(t.morning.needCash);

    await saveMorning(date, opening, portions, allItems);
    onDone();
  };

  return (
    <main className="screen">
      <p className="eyebrow">{formatDay(date)}</p>
      <h1>{existing ? t.morning.editTitle : t.morning.title}</h1>
      <form className="stack" onSubmit={submit}>
        {!existing && (
          <section className="card stack-sm">
            <h2>{t.morning.expensesTitle}</h2>
            <p className="hint">{t.morning.expensesHint}</p>
            {items.map((item, i) => (
              <div className="row" key={i}>
                <span>{item.name}</span>
                <span className="row-end">
                  <span className="num">{money.format(item.amountMinor)}</span>
                  <button
                    type="button"
                    className="link danger"
                    onClick={() => setItems((rows) => rows.filter((_, index) => index !== i))}
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
        )}

        <section className="card stack-sm">
          <h2>{t.morning.portionsTitle}</h2>
          <p className="hint">{t.morning.portionsHint}</p>
          {dishes.map((dish) => (
            <div className="count-row" key={dish.id}>
              <Field label={dish.name}>
                {(id) => (
                  <CountInput
                    id={id}
                    value={counts[dish.id] ?? ''}
                    onChange={(value) => setCounts((c) => ({ ...c, [dish.id]: value }))}
                  />
                )}
              </Field>
            </div>
          ))}
        </section>

        <section className="card stack-sm">
          <h2>{t.morning.cashTitle}</h2>
          <Field label={t.morning.cashLabel} hint={t.morning.cashHint}>
            {(id) => <MoneyInput id={id} value={cash} onChange={setCash} />}
          </Field>
        </section>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big">{existing ? t.common.save : t.morning.start}</button>
        {existing && (
          <button type="button" className="btn ghost" onClick={onDone}>
            {t.common.cancel}
          </button>
        )}
        {!existing && onNotOpen && (
          <button type="button" className="btn ghost" onClick={onNotOpen}>
            {t.morning.notOpen}
          </button>
        )}
      </form>
    </main>
  );
}
