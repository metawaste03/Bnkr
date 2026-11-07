import { markBackedUp } from '../db';
import { createBackup } from '../db/backup';
import { toDateString } from './dates';

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves a backup, using the phone's share sheet where possible so it can go straight to WhatsApp, email or Drive.
 * Returns false if she cancelled, so a cancelled share isn't recorded as a backup.
 */
export async function saveBackup(): Promise<boolean> {
  const content = JSON.stringify(await createBackup());
  const name = `daybook-backup-${toDateString(new Date())}.json`;
  const file = new File([content], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      await markBackedUp();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      // Sharing failed for another reason, so fall through to a normal download.
    }
  }

  downloadFile(name, content, 'application/json');
  await markBackedUp();
  return true;
}
