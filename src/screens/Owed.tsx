import { useMemo, useState } from 'react';
import { Field, MoneyInput } from '../components/common';
import { useApp, useMoney } from '../context';
import { addDebtPayment } from '../db';
import { debtorsOf, openDebts, type Debt } from '../lib/calculations';
import { daysBetween, formatDay } from '../lib/dates';
import type { DebtMethod, Dish, Order } from '../lib/types';
import { t } from '../strings';

export const orderSummary = (order: Order, dishes: Dish[]) =>
  order.lines.map((l) => `${l.qty} × ${dishes.find((d) => d.id === l.dishId)?.name ?? l.dishId}`).join(', ');

export function useOwedTotal(): number {
  const { data } = useApp();
  return useMemo(() => openDebts(data).reduce((sum, d) => sum + d.remaining, 0), [data]);
}

function PayDebtForm({ debt, name, onDone }: { debt: Debt; name: string; onDone: () => void }) {
  const { today } = useApp();
  const money = useMoney();
  const [amount, setAmount] = useState(money.toInput(debt.remaining));
  const [error, setError] = useState<string | null>(null);

  const record = async (minor: number, method: DebtMethod) => {
    if (await addDebtPayment(debt.order.id, today, minor, method)) onDone();
    else setError(t.owed.failed);
  };

  const pay = (method: 'cash' | 'transfer') => {
    const minor = money.parse(amount);
    if (minor === null || minor === 0) return setError(t.common.invalidAmount);
    if (minor > debt.remaining) return setError(t.owed.tooMuch(money.format(debt.remaining)));
    void record(minor, method);
  };

  const writeOff = () => {
    if (window.confirm(t.owed.wontPayConfirm(name, money.format(debt.remaining)))) {
      void record(debt.remaining, 'write-off');
    }
  };

  return (
    <div className="pay-debt stack-sm">
      <Field label={t.owed.amountReceived}>
        {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}
      </Field>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="pay-buttons">
        <button className="btn primary" onClick={() => pay('cash')}>
          {t.sell.cash}
        </button>
        <button className="btn transfer" onClick={() => pay('transfer')}>
          {t.sell.transfer}
        </button>
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={onDone}>
          {t.common.cancel}
        </button>
        <button className="btn ghost danger" onClick={writeOff}>
          {t.owed.wontPay}
        </button>
      </div>
    </div>
  );
}

/** Its own page, so earlier days' unpaid customers never look like entries on today's screen. */
export function OwedScreen({ onBack }: { onBack: () => void }) {
  const total = useOwedTotal();
  return (
    <main className="screen stack">
      <button className="link back" onClick={onBack}>
        ‹ {t.common.back}
      </button>
      {total > 0 ? <OwedList /> : <p className="card">{t.owed.none}</p>}
    </main>
  );
}

/** A button that opens the owed page, showing the total still owed from any day. */
export function OwedButton({ onOpen }: { onOpen: () => void }) {
  const money = useMoney();
  const total = useOwedTotal();
  if (total === 0) return null;
  return (
    <button className="card owed-button" onClick={onOpen}>
      <span className="owed-button-text">
        <strong>{t.owed.title}</strong>
        <span className="hint">{t.owed.buttonHint}</span>
      </span>
      <span className="num strong-num">{money.format(total)} ›</span>
    </button>
  );
}

/** Everyone who still owes money, with a way to record payment on the day it arrives. */
export function OwedList() {
  const { data, today } = useApp();
  const money = useMoney();
  const debtors = useMemo(() => debtorsOf(openDebts(data)), [data]);
  const [paying, setPaying] = useState<string | null>(null);

  if (debtors.length === 0) return null;
  const total = debtors.reduce((sum, d) => sum + d.total, 0);

  return (
    <section className="card stack-sm" aria-labelledby="owed-title">
      <div className="row strong">
        <h2 id="owed-title">{t.owed.title}</h2>
        <span className="num total">{money.format(total)}</span>
      </div>
      <p className="hint">{t.owed.hint}</p>
      {debtors.map((person) => (
        <div className="debtor stack-sm" key={person.key}>
          <div className="row strong">
            <span>{person.name}</span>
            <span className="num">{money.format(person.total)}</span>
          </div>
          {person.debts.map((debt) => (
            <div className="debt stack-sm" key={debt.order.id}>
              <div className="row">
                <span className="debt-info">
                  <span>{orderSummary(debt.order, data.dishes)}</span>
                  <span className="hint">
                    {t.owed.soldOn(formatDay(debt.order.date), t.owed.daysAgo(daysBetween(debt.order.date, today)))}
                    {debt.paid > 0 && ` · ${t.owed.partly(money.format(debt.paid), money.format(debt.remaining))}`}
                  </span>
                </span>
                {paying !== debt.order.id && (
                  <button className="btn secondary small" onClick={() => setPaying(debt.order.id)}>
                    {t.owed.paid}
                  </button>
                )}
              </div>
              {paying === debt.order.id && (
                <PayDebtForm debt={debt} name={person.name} onDone={() => setPaying(null)} />
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
