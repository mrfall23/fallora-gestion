'use client';
import { useEffect, useState } from 'react';
import { VAPID_PUBLIC_KEY } from '@/lib/vapid';

// Bouton d'activation des notifications de vente. Rendu uniquement dans
// l'espace admin -> seul l'admin peut s'abonner et recevoir les alertes.

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Etat = 'chargement' | 'non-supporte' | 'inactif' | 'actif' | 'refuse';

export default function PushToggle() {
  const [etat, setEtat] = useState<Etat>('chargement');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEtat('non-supporte');
      return;
    }
    if (Notification.permission === 'denied') { setEtat('refuse'); return; }
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setEtat(sub ? 'actif' : 'inactif'))
      .catch(() => setEtat('inactif'));
  }, []);

  const activer = async () => {
    setOccupe(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setEtat(perm === 'denied' ? 'refuse' : 'inactif'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      setEtat(r.ok ? 'actif' : 'inactif');
    } catch {
      setEtat('inactif');
    } finally {
      setOccupe(false);
    }
  };

  const desactiver = async () => {
    setOccupe(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEtat('inactif');
    } catch {
      /* ignore */
    } finally {
      setOccupe(false);
    }
  };

  // Rien tant qu'on ne sait pas, ou si le navigateur ne supporte pas.
  if (etat === 'chargement' || etat === 'non-supporte') return null;

  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px',
    borderRadius: '14px', fontSize: '13px', fontWeight: 600, width: '100%',
    border: '1px solid var(--line)', textAlign: 'left',
  };

  if (etat === 'refuse') {
    return (
      <div style={{ ...base, background: 'var(--surface)', color: 'var(--ink-55)', cursor: 'default' }}>
        <span className="ms" style={{ fontSize: '19px', color: 'var(--ink-45)' }}>notifications_off</span>
        <span style={{ fontSize: '12px', lineHeight: 1.35 }}>Notifications bloquées. Autorise-les dans les réglages du navigateur.</span>
      </div>
    );
  }

  if (etat === 'actif') {
    return (
      <button onClick={desactiver} disabled={occupe} title="Désactiver les notifications de vente"
        style={{ ...base, cursor: occupe ? 'wait' : 'pointer', background: 'var(--success-tint)', borderColor: 'var(--success-line)', color: 'var(--success)' }}>
        <span className="ms" style={{ fontSize: '19px' }}>notifications_active</span>
        <span style={{ flex: 1 }}>Notifications actives</span>
        <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.8 }}>désactiver</span>
      </button>
    );
  }

  // inactif
  return (
    <button onClick={activer} disabled={occupe}
      style={{ ...base, cursor: occupe ? 'wait' : 'pointer', background: 'var(--accent-12)', borderColor: 'var(--accent-25)', color: 'var(--accent-deep)' }}>
      <span className="ms" style={{ fontSize: '19px', color: 'var(--accent)' }}>notifications</span>
      <span>{occupe ? 'Activation…' : 'Activer les notifications'}</span>
    </button>
  );
}
