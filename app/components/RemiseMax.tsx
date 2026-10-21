'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Plafond de remise que les vendeuses peuvent accorder (reglages.remise_max_pct).
// La base l'applique dans enregistrer_vente() ; l'admin n'est pas plafonnee.
export default function RemiseMax() {
  const [valeur, setValeur] = useState<number | ''>('');
  const [enregistre, setEnregistre] = useState<number | null>(null);
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur'>('');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    supabase.from('reglages').select('remise_max_pct').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) { setValeur(Number(data.remise_max_pct)); setEnregistre(Number(data.remise_max_pct)); }
    });
  }, []);

  const enregistrer = async () => {
    const pct = Number(valeur);
    if (valeur === '' || isNaN(pct) || pct < 0 || pct > 100) { setEtat('erreur'); setDetail('Entrez un pourcentage entre 0 et 100.'); return; }
    const { error } = await supabase.from('reglages').update({ remise_max_pct: pct }).eq('id', 1);
    if (error) { setEtat('erreur'); setDetail(error.message); return; }
    setEnregistre(pct); setEtat('ok'); setDetail('');
    setTimeout(() => setEtat(''), 2500);
  };

  return (
    <div style={{ marginBottom: '24px', padding: '20px 22px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="ms" style={{ fontSize: '26px', color: 'var(--accent)' }}>sell</span>
          <div>
            <div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--ink)' }}>Remise maximum des vendeuses</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-55)' }}>Au-delà, la vente est refusée. Mettez 0 pour interdire les remises. Vous n&apos;êtes pas limitée.</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="number" min={0} max={100} inputMode="numeric" aria-label="Remise maximum en pourcentage" value={valeur} onChange={e => setValeur(e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={e => e.key === 'Enter' && enregistrer()} style={{ width: '80px', height: '40px', padding: '0 12px', borderRadius: '11px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px', textAlign: 'right' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink-70)' }}>%</span>
          <button onClick={enregistrer} disabled={valeur === enregistre} style={{ height: '40px', padding: '0 16px', borderRadius: '11px', border: 'none', cursor: valeur === enregistre ? 'default' : 'pointer', background: valeur === enregistre ? 'var(--surface-inset)' : 'var(--accent-grad)', color: valeur === enregistre ? 'var(--ink-45)' : 'var(--on-accent)', fontSize: '13.5px', fontWeight: 700 }}>
            {etat === 'ok' ? 'Enregistré ✓' : 'Enregistrer'}
          </button>
        </div>
      </div>
      {etat === 'erreur' && <div role="alert" style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--danger)', fontWeight: 600 }}>{detail}</div>}
    </div>
  );
}
