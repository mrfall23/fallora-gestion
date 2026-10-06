'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire, lireParIds } from '@/lib/requetes';

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' as const };
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' as const };

export default function AdminVentes() {
  const [ventes, setVentes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [venteAAnnuler, setVenteAAnnuler] = useState<number | null>(null);
  const [motif, setMotif] = useState('');
  const [erreurAnnul, setErreurAnnul] = useState('');
  const [annulation, setAnnulation] = useState(false);

  useEffect(() => { chargerVentes(); }, []);

  const chargerVentes = async () => {
    const ventesData = await toutLire(() => supabase.from('ventes').select('*').eq('annulee', false).order('date_vente', { ascending: false }).order('id', { ascending: false }));
    if (ventesData.length === 0) { setVentes([]); setChargement(false); return; }
    const [clientes, utilisateurs] = await Promise.all([
      lireParIds('clientes', 'id, nom, telephone', 'id', ventesData.map((v: any) => v.cliente_id)),
      lireParIds('utilisateurs', 'id, nom', 'id', ventesData.map((v: any) => v.vendeuse_id)),
    ]);
    const assembled = ventesData.map((v: any) => ({
      ...v,
      cliente: (clientes || []).find((c: any) => c.id === v.cliente_id) || null,
      vendeuse: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null,
    }));
    setVentes(assembled);
    setChargement(false);
  };

  // Annulation (admin) : archive la vente et remet le stock en rayon.
  const ouvrirAnnulation = (id: number) => { setVenteAAnnuler(id); setMotif(''); setErreurAnnul(''); };

  const confirmerAnnulation = async (id: number) => {
    if (!motif.trim()) { setErreurAnnul("Indiquez le motif de l'annulation."); return; }
    setAnnulation(true); setErreurAnnul('');
    const { error } = await supabase.rpc('annuler_vente', { p_vente_id: id, p_motif: motif.trim() });
    setAnnulation(false);
    if (error) { setErreurAnnul(error.message || "Échec de l'annulation."); return; }
    setVenteAAnnuler(null);
    await chargerVentes();
  };

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>;

  return (
    <div className="fade-up">
      {ventes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>receipt_long</span>
          Aucune vente enregistrée.
        </div>
      ) : (
        <div style={{ borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', overflow: 'hidden' }}>
         <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.1fr 1fr .9fr .8fr 44px', gap: '16px', padding: '16px 24px', background: 'var(--surface-inset)', borderBottom: '1px solid var(--line)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--ink-45)', minWidth: '680px' }}>
            <div>Cliente</div><div>Vendeuse</div><div>Montant</div><div>Statut</div><div style={{ textAlign: 'right' }}>Date</div><div />
          </div>
          {ventes.map(v => (
           <div key={v.id}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.1fr 1fr .9fr .8fr 44px', gap: '16px', padding: '16px 24px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center', minWidth: '680px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-16)', flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '15px', color: 'var(--accent)', fontWeight: 600 }}>{(v.cliente?.nom || 'I')[0]}</span>
                </div>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)' }}>{v.cliente?.nom || 'Inconnue'}</div>
                  {v.cliente?.telephone && <div style={{ fontSize: '11.5px', color: 'var(--ink-45)' }}>{v.cliente.telephone}</div>}
                </div>
              </div>
              <div style={{ fontSize: '14px', color: 'var(--ink-70)' }}>{v.vendeuse?.nom || '—'}</div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{v.total?.toLocaleString()}</span>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginLeft: '5px' }}>FCFA</span>
                {v.reste_a_payer > 0 && <div style={{ fontSize: '11.5px', color: 'var(--warn)', marginTop: '2px' }}>Reste : {v.reste_a_payer?.toLocaleString()}</div>}
              </div>
              <div><span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : 'Partiel'}</span></div>
              <div style={{ textAlign: 'right', fontSize: '13.5px', color: 'var(--ink-55)' }}>
                {new Date(v.date_vente).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </div>
              <button onClick={() => venteAAnnuler === v.id ? setVenteAAnnuler(null) : ouvrirAnnulation(v.id)} aria-label={`Annuler la vente n°${v.id}`} title="Annuler cette vente" style={{ width: '38px', height: '38px', borderRadius: '11px', cursor: 'pointer', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="ms" style={{ fontSize: '18px' }}>block</span>
              </button>
            </div>
            {venteAAnnuler === v.id && (
              <div style={{ padding: '16px 24px', background: 'var(--danger-tint)', borderBottom: '1px solid var(--danger-line)', minWidth: '680px' }}>
                <div style={{ fontSize: '13.5px', color: 'var(--ink)', marginBottom: '10px' }}>
                  Annuler la vente n°{v.id} ({v.total?.toLocaleString()} FCFA) ? Les articles seront <strong>remis en stock</strong> et la vente sortira des statistiques. Elle reste archivée.
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input autoFocus value={motif} onChange={e => setMotif(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmerAnnulation(v.id); }} placeholder="Motif (ex : erreur de saisie, retour client…)" style={{ flex: 1, minWidth: '220px', height: '40px', padding: '0 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px' }} />
                  <button onClick={() => confirmerAnnulation(v.id)} disabled={annulation} style={{ height: '40px', padding: '0 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--danger)', color: '#fff', border: 'none' }}>{annulation ? 'Annulation…' : "Confirmer l'annulation"}</button>
                  <button onClick={() => setVenteAAnnuler(null)} disabled={annulation} style={{ height: '40px', padding: '0 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-55)', border: '1px solid var(--line)' }}>Retour</button>
                </div>
                {erreurAnnul && <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '8px' }}>{erreurAnnul}</div>}
              </div>
            )}
           </div>
          ))}
         </div>
        </div>
      )}
    </div>
  );
}
