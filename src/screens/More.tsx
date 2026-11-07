import { useRef, useState } from 'react';
import { Field, MoneyInput } from '../components/common';
import { useApp, useMoney } from '../context';
import { addDish, deleteDish, isDishUsed, updateDish } from '../db';
import { restoreBackup, validateBackup } from '../db/backup';
import { saveBackup, downloadFile } from '../lib/files';
import { expensesCsv, salesCsv } from '../lib/csv';
import type { Dish } from '../lib/types';
import { t } from '../strings';

type Message = { text: string; bad?: boolean } | null;

function DishEditor({
  dish,
  used,
  onlyDish,
  onMessage,
}: {
  dish: Dish;
  used: boolean;
  onlyDish: boolean;
  onMessage: (m: Message) => void;
}) {
  const money = useMoney();
  const [name, setName] = useState(dish.name);
  const [price, setPrice] = useState(money.toInput(dish.priceMinor));
  const [error, setError] = useState<string | null>(null);

  const priceMinor = money.parse(price);
  const changed = name.trim() !== dish.name || priceMinor !== dish.priceMinor;

  const save = async () => {
    if (!name.trim() || priceMinor === null) return setError(t.setup.needDish);
    setError(null);
    await updateDish(dish.id, { name: name.trim(), priceMinor });
    onMessage({ text: t.more.dishSaved(name.trim()) });
  };

  const hide = () => {
    if (window.confirm(t.more.removeDishConfirm(dish.name))) void updateDish(dish.id, { active: false });
  };

  const remove = async () => {
    if (!window.confirm(t.more.deleteDishConfirm(dish.name))) return;
    if (!(await deleteDish(dish.id))) void updateDish(dish.id, { active: false }); // it was sold meanwhile
  };

  return (
    <div className="dish-editor stack-sm">
      <Field label={t.setup.dishName}>
        {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label={t.setup.price}>
        {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
      </Field>
      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        {changed && (
          <button className="btn primary" onClick={save}>
            {t.more.saveDish}
          </button>
        )}
        {!onlyDish &&
          (used ? (
            <button className="btn ghost" onClick={hide}>
              {t.more.removeDish}
            </button>
          ) : (
            <button className="btn ghost danger" onClick={remove}>
              {t.more.deleteDish}
            </button>
          ))}
      </div>
      <p className="hint">{onlyDish ? t.more.lastDish : used ? t.more.usedHint : t.more.unusedHint}</p>
    </div>
  );
}

function AddDish({ nextSort, onMessage }: { nextSort: number; onMessage: (m: Message) => void }) {
  const money = useMoney();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const priceMinor = money.parse(price);
    if (!name.trim() || priceMinor === null) return setError(t.setup.needDish);
    await addDish(name.trim(), priceMinor, nextSort);
    setName('');
    setPrice('');
    setError(null);
    onMessage({ text: t.more.dishSaved(name.trim()) });
  };

  return (
    <div className="dish-editor stack-sm">
      <h3>{t.more.addDishTitle}</h3>
      <Field label={t.setup.dishName}>
        {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label={t.setup.price}>
        {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
      </Field>
      {error && <p className="error">{error}</p>}
      <button className="btn secondary" onClick={add}>
        {t.more.addDish}
      </button>
    </div>
  );
}

export function More() {
  const { data, today } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);

  const activeDishes = data.dishes.filter((d) => d.active);
  const hiddenDishes = data.dishes.filter((d) => !d.active);
  const nextSort = data.dishes.reduce((max, d) => Math.max(max, d.sort), -1) + 1;
  const lastBackupAt = data.settings?.lastBackupAt;

  const backup = async () => {
    if (await saveBackup()) setMessage({ text: t.more.backupSaved });
  };

  const restore = async (file: File) => {
    const fail = () => setMessage({ text: t.more.restoreBad, bad: true });
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return fail();
    }
    const valid = validateBackup(parsed);
    if (!valid) return fail();
    const exported = new Date(valid.exportedAt).toLocaleString();
    if (!window.confirm(t.more.restoreConfirm(exported))) return;
    await restoreBackup(valid);
    setMessage({ text: t.more.restored });
  };

  return (
    <main className="screen stack">
      <h1>{t.more.title}</h1>

      {message && (
        <p className={message.bad ? 'error' : 'notice'} role="status">
          {message.text}
        </p>
      )}

      <section className="card stack">
        <div className="stack-sm">
          <h2>{t.more.dishes}</h2>
          <p className="hint">{t.more.dishesHint}</p>
        </div>
        {activeDishes.map((dish) => (
          <DishEditor
            key={`${dish.id}-${dish.name}-${dish.priceMinor}`}
            dish={dish}
            used={isDishUsed(data, dish.id)}
            onlyDish={activeDishes.length === 1}
            onMessage={setMessage}
          />
        ))}
        <AddDish nextSort={nextSort} onMessage={setMessage} />
        {hiddenDishes.length > 0 && (
          <div className="stack-sm">
            <h3>{t.more.hiddenTitle}</h3>
            {hiddenDishes.map((dish) => (
              <div className="row" key={dish.id}>
                <span>{dish.name}</span>
                <button className="link" onClick={() => void updateDish(dish.id, { active: true })}>
                  {t.more.showDish}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="hint">{t.more.currency(data.settings?.currency ?? '')}</p>
      </section>

      <section className="card stack-sm">
        <h2>{t.more.backupTitle}</h2>
        <p className="hint">{t.more.backupHint}</p>
        <p>
          {lastBackupAt ? t.more.lastBackup(new Date(lastBackupAt).toLocaleDateString()) : t.more.neverBackedUp}
        </p>
        <button className="btn primary" onClick={backup}>
          {t.more.saveBackup}
        </button>
        <button className="btn ghost" onClick={() => fileInput.current?.click()}>
          {t.more.restore}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="restore-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void restore(file);
          }}
        />
      </section>

      <section className="card stack-sm">
        <h2>{t.more.exportTitle}</h2>
        <p className="hint">{t.more.exportHint}</p>
        <div className="btn-row">
          <button className="btn secondary" onClick={() => downloadFile(`bnkr-sales-${today}.csv`, salesCsv(data), 'text/csv')}>
            {t.more.exportSales}
          </button>
          <button className="btn secondary" onClick={() => downloadFile(`bnkr-costs-${today}.csv`, expensesCsv(data), 'text/csv')}>
            {t.more.exportCosts}
          </button>
        </div>
      </section>
    </main>
  );
}
