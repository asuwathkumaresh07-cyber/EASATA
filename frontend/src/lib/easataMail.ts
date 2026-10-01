// Real email delivery for EASATA alerts, through the backend's SMTP sender.
import { api } from './api';
import { emailFor, simStore, type AlertStatus, type Sim, type Tx } from './easata';

export type MailStatus = { to: string; smtp_host: string; smtp_port: number; configured: boolean; problem: string | null };
export type SendResult = { sent: boolean; to: string; detail: string };

export const mailStatus = () => api<MailStatus>('/api/easata/email/status');

export async function sendAlert(sim: Sim, t: Tx, status: AlertStatus): Promise<SendResult> {
  const { subject, body, html } = emailFor(sim, t, status);
  try {
    const r = await api<SendResult>('/api/easata/email', { body: { subject, body, html } });
    if (r.sent) simStore.markEmailed([t.alertNo!]);
    return r;
  } catch (e) {
    return { sent: false, to: '', detail: e instanceof Error ? `The backend could not be reached (${e.message}). Is it running on port 8000?` : 'The backend could not be reached.' };
  }
}

/** Sends several alerts one after another; reports progress. */
export async function sendAlerts(sim: Sim, list: Tx[], statusOf: (n: number) => AlertStatus, onProgress?: (done: number, r: SendResult) => void) {
  const results: SendResult[] = [];
  for (const t of list) {
    const r = await sendAlert(sim, t, statusOf(t.alertNo!));
    results.push(r);
    onProgress?.(results.length, r);
    if (!r.sent) break; // same problem would repeat for every alert
  }
  return results;
}

// "Email flagged alerts automatically after each simulation" preference (per browser).
export const getAutoEmail = () => {
  try {
    return localStorage.getItem('easata-auto-email') !== '0';
  } catch {
    return true;
  }
};
export const setAutoEmail = (v: boolean) => {
  try {
    localStorage.setItem('easata-auto-email', v ? '1' : '0');
  } catch {
    /* ignore */
  }
};
