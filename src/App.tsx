import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { AppProvider } from './context';
import { loadAll } from './db';
import { toDateString } from './lib/dates';
import { saveBackup } from './lib/files';
import type { AllData } from './lib/types';
import { Closing } from './screens/Closing';
import { DayView } from './screens/DayView';
import { More } from './screens/More';
import { Morning } from './screens/Morning';
import { Sell } from './screens/Sell';
import { Setup } from './screens/Setup';
import { Week } from './screens/Week';
import { t } from './strings';

type Tab = 'sell' | 'today' | 'week' | 'more';
const TABS: Tab[] = ['sell', 'today', 'week', 'more'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The current date, kept fresh when the app comes back from the background or passes midnight. */
function useToday(): string {
  const [today, setToday] = useState(() => toDateString(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toDateString(new Date()));
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, []);
  return today;
}

function backupOverdue(data: AllData): boolean {
  if (!data.settings || data.days.length === 0) return false;
  const since = data.settings.lastBackupAt ?? data.settings.createdAt;
  return Date.now() - since > WEEK_MS;
}

function Shell({ data, today }: { data: AllData; today: string }) {
  const [tab, setTab] = useState<Tab>('sell');
  const [dayDate, setDayDate] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [morningDate, setMorningDate] = useState<string | null>(null);
  const [notOpenOn, setNotOpenOn] = useState<string | null>(null);
  const [hideBackupBanner, setHideBackupBanner] = useState(false);

  // An earlier day left open has to be dealt with before anything else, oldest first.
  const closedDates = new Set(data.closings.map((c) => c.date));
  const forgottenDate =
    data.days
      .map((d) => d.date)
      .filter((date) => date < today && !closedDates.has(date))
      .sort()[0] ?? null;

  useEffect(() => {
    if (forgottenDate && !closingDate) setClosingDate(forgottenDate);
  }, [forgottenDate, closingDate]);

  if (closingDate) {
    return (
      <Closing
        key={closingDate}
        date={closingDate}
        forgotten={closingDate < today && !closedDates.has(closingDate)}
        onDone={() => setClosingDate(null)}
      />
    );
  }
  if (forgottenDate) return null; // the effect above opens it on the next render

  const needsMorning = !data.days.some((d) => d.date === today) && notOpenOn !== today;
  if (morningDate || needsMorning) {
    const date = morningDate ?? today;
    return (
      <Morning
        key={date}
        date={date}
        onDone={() => {
          setMorningDate(null);
          setNotOpenOn(null);
        }}
        onNotOpen={morningDate ? () => setMorningDate(null) : () => setNotOpenOn(today)}
      />
    );
  }

  const openToday = () => setMorningDate(today);

  const dayProps = {
    onOpenToday: openToday,
    onClose: setClosingDate,
    onEditMorning: setMorningDate,
  };

  return (
    <div className="app">
      {backupOverdue(data) && !hideBackupBanner && (
        <div className="banner" role="status">
          <span>{t.backupBanner.text}</span>
          <span className="btn-row">
            <button className="btn ghost small" onClick={() => setHideBackupBanner(true)}>
              {t.backupBanner.later}
            </button>
            <button className="btn primary small" onClick={() => void saveBackup()}>
              {t.backupBanner.action}
            </button>
          </span>
        </div>
      )}

      {dayDate ? (
        <DayView key={dayDate} date={dayDate} onBack={() => setDayDate(null)} {...dayProps} />
      ) : (
        <>
          {tab === 'sell' && (
            <Sell
              onOpenToday={openToday}
              onClose={() => setClosingDate(today)}
              onViewToday={() => setTab('today')}
            />
          )}
          {tab === 'today' && <DayView key={today} date={today} {...dayProps} />}
          {tab === 'week' && <Week onOpenDay={setDayDate} />}
          {tab === 'more' && <More />}
        </>
      )}

      <nav className="tabs" aria-label="Main">
        {TABS.map((name) => (
          <button
            key={name}
            className={tab === name && !dayDate ? 'tab active' : 'tab'}
            aria-current={tab === name && !dayDate ? 'page' : undefined}
            onClick={() => {
              setDayDate(null);
              setTab(name);
            }}
          >
            {t.tabs[name]}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  const data = useLiveQuery(loadAll);
  const today = useToday();

  if (!data) return <main className="screen center">{t.common.loading}</main>;

  return (
    <AppProvider value={{ data, today }}>
      {data.settings ? <Shell data={data} today={today} /> : <Setup />}
    </AppProvider>
  );
}
