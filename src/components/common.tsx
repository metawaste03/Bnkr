import { useId, useState, type ReactNode } from 'react';
import { useMoney } from '../context';
import { t } from '../strings';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      className="input"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function CountInput({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      id={id}
      className="input count"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'row strong' : 'row'}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

/** Item and amount entry with one-tap suggestions from past entries. */
export function ExpenseEntry({
  name,
  amount,
  onName,
  onAmount,
  onAdd,
  suggestions,
  error,
}: {
  name: string;
  amount: string;
  onName: (v: string) => void;
  onAmount: (v: string) => void;
  onAdd: () => void;
  suggestions: { name: string; amountMinor: number }[];
  error?: string | null;
}) {
  const money = useMoney();
  return (
    <div className="stack-sm">
      {suggestions.length > 0 && <p className="hint">{t.common.usedBefore}</p>}
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              className="chip"
              onClick={() => {
                onName(s.name);
                onAmount(money.toInput(s.amountMinor));
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="expense-entry">
        <input
          className="input"
          aria-label={t.common.item}
          placeholder={t.common.item}
          value={name}
          onChange={(e) => onName(e.target.value)}
        />
        <MoneyInput value={amount} onChange={onAmount} />
        <button type="button" className="btn secondary" onClick={onAdd}>
          {t.common.add}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Draft state for ExpenseEntry. take() returns the entry and clears it, or null if there's nothing valid to add. */
export function useExpenseDraft() {
  const money = useMoney();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const take = () => {
    if (!name.trim() && !amount.trim()) return null;
    const amountMinor = money.parse(amount);
    if (!name.trim() || amountMinor === null) {
      setError(t.common.invalidAmount);
      return 'invalid' as const;
    }
    const entry = { name: name.trim(), amountMinor };
    setName('');
    setAmount('');
    setError(null);
    return entry;
  };

  return { name, amount, error, setName, setAmount, take };
}
