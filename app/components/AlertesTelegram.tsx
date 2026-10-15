'use client';
import { useEffect, useState } from 'react';

// Panneau admin : etat des alertes Telegram + bouton d'alerte de test.
export default function AlertesTelegram() {
  const [actif, setActif] = useState<boolean | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    fetch('/api/alertes').then(r => r.ok ? r.json() : null).then(d => setActif(d ? !!d.telegram : false)).catch(() => setActif(false));
  }, []);

  const tester = async () => {
    setEnvoi(true); setResultat(null);
    try {
      const r = await fetch('/api/alertes', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      setResultat(r.ok ? { ok: true, texte: 'Message envoyé — vérifiez Telegram.' } : { ok: false, texte: d.message || "Échec de l'envoi." });
    } catch {
      setResultat({ ok: false, texte: 'Erreur réseau.' });
    }
    setEnvoi(false);
  };

  return (
    <div style={{ marginBottom: '24px', padding: '20px 22px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="ms" style={{ fontSize: '26px', color: 'var(--accent)' }}>send</span>
          <div>
            <div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--ink)' }}>Alertes Telegram</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-55)' }}>Chaque nouvelle vente et les produits qui passent en stock bas.</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {actif !== null && (
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '20px', color: actif ? 'var(--success)' : 'var(--warn)', background: actif ? 'var(--success-tint)' : 'var(--warn-tint)', border: `1px solid ${actif ? 'var(--success-line)' : 'var(--warn-line)'}` }}>
              {actif ? 'Activées' : 'Non configurées'}
            </span>
          )}
          <button onClick={tester} disabled={envoi || !actif} style={{ height: '40px', padding: '0 16px', borderRadius: '12px', cursor: envoi || !actif ? 'not-allowed' : 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600, opacity: !actif ? 0.6 : 1 }}>
            {envoi ? 'Envoi…' : 'Envoyer une alerte de test'}
          </button>
        </div>
      </div>
      {actif === false && (
        <div style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--ink-55)' }}>
          Ajoutez <code>TELEGRAM_BOT_TOKEN</code> et <code>TELEGRAM_CHAT_ID</code> dans les variables d&apos;environnement Vercel du projet, puis redéployez.
        </div>
      )}
      {resultat && <div role="status" style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600, color: resultat.ok ? 'var(--success)' : 'var(--danger)' }}>{resultat.texte}</div>}
    </div>
  );
}
