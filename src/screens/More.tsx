import { useEffect, useRef, useState } from 'react';
import { MoneyInput } from '../components/common';
import { useApp, useMoney } from '../context';
import { addDish, updateDish } from '../db';
import { restoreBackup, validateBackup } from '../db/backup';
import { saveBackup, downloadFile } from '../lib/files';
import { expensesCsv, salesCsv } from '../lib/csv';
import type { Dish } from '../lib/types';
import { t } from '../strings';

function DishEditor({ dish }: { dish: Dish }) {
  const money = useMoney();
  const [name, setName] = useState(dish.name);
  const [price, setPrice] = useState(money.toInput(dish.priceMinor));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setName(dish.name);
    setPrice(money.toInput(dish.priceMinor));
  }, [dish.name, dish.priceMinor, money]);

  const commit = () => {
    const priceMinor = money.parse(price);
    setInvalid(priceMinor === null || !name.trim());
    if (priceMinor === null || !name.trim()) return;
    if (name.trim() !== dish.name || priceMinor !== dish.priceMinor) {
      void updateDish(dish.id, { name: name.trim(), priceMinor });
    }
  };

  return (
    <div className="stack-sm">
      <div className="dish-edit">
        <input
          className="input"
          aria-label={t.setup.dishName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
        />
        <div onBlur={commit}>
          <MoneyInput value={price} onChange={setPrice} />
        </div>
        <button
          className="link danger"
          onClick={() => {
            if (window.confirm(t.more.removeDishConfirm(dish.name))) void updateDish(dish.id, { active: false });
          }}
        >
          {t.more.removeDish}
        </button>
      </div>
      {invalid && <p className="error">{t.common.invalidAmount}</p>}
    </div>
  );
}

export function More() {
  const { data, today } = useApp();
  const money = useMoney();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const activeDishes = data.dishes.filter((d) => d.active);
  const lastBackupAt = data.settings?.lastBackupAt;

  const addNewDish = async () => {
    const priceMinor = money.parse(newPrice);
    if (!newName.trim() || priceMinor === null) {
      setMessage({ text: t.setup.needDish, bad: true });
      return;
    }
    await addDish(newName.trim(), priceMinor, data.dishes.length);
    setNewName('');
    setNewPrice('');
    setMessage(null);
  };

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
        <h2>{t.more.dishes}</h2>
        <p className="hint">{t.more.dishesHint}</p>
        {activeDishes.map((dish) => (
          <DishEditor key={dish.id} dish={dish} />
        ))}
        <div className="dish-edit">
          <input
            className="input"
            aria-label={t.setup.dishName}
            placeholder={t.setup.dishName}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <MoneyInput value={newPrice} onChange={setNewPrice} />
          <button className="link" onClick={addNewDish}>
            {t.common.add}
          </button>
        </div>
        <p className="hint">{t.more.currency(data.settings?.currency ?? '')}</p>
      </section>

      <section className="card stack-sm">
        <h2>{t.more.exportTitle}</h2>
        <p className="hint">{t.more.exportHint}</p>
        <div className="btn-row">
          <button className="btn secondary" onClick={() => downloadFile(`daybook-sales-${today}.csv`, salesCsv(data), 'text/csv')}>
            {t.more.exportSales}
          </button>
          <button className="btn secondary" onClick={() => downloadFile(`daybook-costs-${today}.csv`, expensesCsv(data), 'text/csv')}>
            {t.more.exportCosts}
          </button>
        </div>
      </section>
    </main>
  );
}
