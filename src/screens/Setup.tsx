import { useState, type FormEvent } from 'react';
import { Field, MoneyInput } from '../components/common';
import { completeSetup } from '../db';
import { fractionDigits, isValidCurrency, parseMoney } from '../lib/money';
import { t } from '../strings';

const CURRENCIES = [
  'NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'GHS', 'KES', 'ZAR',
  'MXN', 'BRL', 'COP', 'ARS', 'PEN', 'CLP', 'INR', 'PHP', 'IDR',
];
const OTHER = 'other';

export function Setup() {
  const [choice, setChoice] = useState('NGN');
  const [otherCode, setOtherCode] = useState('');
  const [dishes, setDishes] = useState([
    { name: '', price: '' },
    { name: '', price: '' },
    { name: '', price: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const setDish = (index: number, changes: Partial<(typeof dishes)[number]>) =>
    setDishes((rows) => rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const currency = choice === OTHER ? otherCode.trim().toUpperCase() : choice;
    if (!isValidCurrency(currency)) return setError(t.setup.currencyInvalid);

    const digits = fractionDigits(currency);
    const filled = dishes.filter((d) => d.name.trim() || d.price.trim());
    const parsed = filled.map((d) => ({ name: d.name.trim(), priceMinor: parseMoney(d.price, digits) }));
    if (parsed.length === 0 || parsed.some((d) => !d.name || d.priceMinor === null)) {
      return setError(t.setup.needDish);
    }

    // Ask the browser not to clear this data under storage pressure. It's fine if it declines.
    void navigator.storage?.persist?.();
    await completeSetup(currency, parsed as { name: string; priceMinor: number }[]);
  };

  return (
    <main className="screen">
      <h1>{t.setup.title}</h1>
      <p className="lead">{t.setup.intro}</p>
      <form className="stack" onSubmit={submit}>
        <Field label={t.setup.currency}>
          {(id) => (
            <select id={id} className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
              <option value={OTHER}>{t.setup.otherCurrency}</option>
            </select>
          )}
        </Field>
        {choice === OTHER && (
          <Field label={t.setup.currencyCode}>
            {(id) => (
              <input
                id={id}
                className="input"
                maxLength={3}
                autoCapitalize="characters"
                value={otherCode}
                onChange={(e) => setOtherCode(e.target.value)}
              />
            )}
          </Field>
        )}
        {dishes.map((dish, i) => (
          <fieldset key={i} className="card stack-sm">
            <legend>{t.setup.dish(i + 1)}</legend>
            <Field label={t.setup.dishName}>
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={dish.name}
                  onChange={(e) => setDish(i, { name: e.target.value })}
                />
              )}
            </Field>
            <Field label={t.setup.price}>
              {(id) => <MoneyInput id={id} value={dish.price} onChange={(price) => setDish(i, { price })} />}
            </Field>
          </fieldset>
        ))}
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDishes((rows) => [...rows, { name: '', price: '' }])}
        >
          {t.setup.addDish}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big">{t.setup.start}</button>
      </form>
    </main>
  );
}
