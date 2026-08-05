'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const MEDALS = [
  { color: '#B8912E', bg: 'rgba(184,145,46,.14)', border: 'rgba(184,145,46,.4)', icon: 'emoji_events', cardBg: 'linear-gradient(180deg,rgba(184,145,46,.10),var(--surface))' },
  { color: '#8C9099', bg: 'rgba(140,144,153,.14)', border: 'rgba(140,144,153,.38)', icon: 'workspace_premium', cardBg: 'linear-gradient(180deg,rgba(140,144,153,.08),var(--surface))' },
  { color: '#A5673B', bg: 'rgba(165,103,59,.15)', border: 'rgba(165,103,59,.38)', icon: 'military_tech', cardBg: 'linear-gradient(180deg,rgba(165,103,59,.10),var(--surface))' },
];

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '4px 10px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '4px 10px', borderRadius: '20px' } as const;

export default function AdminVendeuses() {
  const [vendeuses, setVendeuses] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [detailOuvert, setDetailOuvert] = useState<number | null>(null);
  const [ventesDetail, setVentesDetail] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);

  useEffect(() => {
    chargerVendeuses();
    const canal = supabase.channel('vendeuses').on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => chargerVendeuses()).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  const chargerVendeuses = async () => {
    const { data: utilisateurs } = await supabase.from('utilisateurs').select('*').eq('role', 'vendeuse').eq('actif', true);
    const { data: ventes } = await supabase.from('ventes').select('*').eq('annulee', false);
    const venteIds = (ventes || []).map((v: any) => v.id);
    const { data: venteProduits } = venteIds.length > 0 ? await supabase.from('vente_produits').select('vente_id, quantite').in('vente_id', venteIds) : { data: [] };
    const result = (utilisateurs || []).map((u: any) => {
      const vv = (ventes || []).filter((v: any) => v.vendeuse_id === u.id);
      const ids = vv.map((v: any) => v.id);
      return { ...u, totalVentes: vv.reduce((s: number, v: any) => s + v.total, 0), totalEncaisse: vv.reduce((s: number, v: any) => s + v.montant_paye, 0), nbVentes: vv.length, nbProduits: (venteProduits || []).filter((vp: any) => ids.includes(vp.vente_id)).reduce((s: number, vp: any) => s + vp.quantite, 0) };
    }).sort((a: any, b: any) => b.totalVentes - a.totalVentes);
    setVendeuses(result);
    setChargement(false);
  };

  const voirDetail = async (vendeuseId: number) => {
    if (detailOuvert === vendeuseId) { setDetailOuvert(null); setVentesDetail([]); return; }
    setDetailOuvert(vendeuseId); setChargementDetail(true);
    const { data: ventesData } = await supabase.from('ventes').select('*').eq('vendeuse_id', vendeuseId).eq('annulee', false).order('date_vente', { ascending: false });
    if (!ventesData || ventesData.length === 0) { setVentesDetail([]); setChargementDetail(false); return; }
    const clienteIds = [...new Set(ventesData.map((v: any) => v.cliente_id).filter(Boolean))];
    const { data: clientes } = clienteIds.length > 0 ? await supabase.from('clientes').select('id, nom').in('id', clienteIds) : { data: [] };
    const venteIds = ventesData.map((v: any) => v.id);
    const { data: vp } = await supabase.from('vente_produits').select('*').in('vente_id', venteIds);
    const produitIds = [...new Set((vp || []).map((x: any) => x.produit_id).filter(Boolean))];
    const { data: produits } = produitIds.length > 0 ? await supabase.from('produits').select('id, nom').in('id', produitIds) : { data: [] };
    setVentesDetail(ventesData.map((v: any) => ({ ...v, cliente: (clientes || []).find((c: any) => c.id === v.cliente_id) || null, vente_produits: (vp || []).filter((x: any) => x.vente_id === v.id).map((x: any) => ({ ...x, produits: (produits || []).find((p: any) => p.id === x.produit_id) })) })));
    setChargementDetail(false);
  };

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>;

  return (
    <div className="fade-up">
      {/* Podium top 3 */}
      {vendeuses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '18px', marginBottom: '24px' }}>
          {vendeuses.slice(0, 3).map((v, i) => {
            const m = MEDALS[i];
            return (
              <div key={v.id} style={{ padding: '24px', borderRadius: '20px', background: m.cardBg, border: `1px solid ${m.border}`, backdropFilter: 'blur(20px)', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ width: '58px', height: '58px', margin: '0 auto 14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.bg, border: `1.5px solid ${m.border}` }}>
                  <span className="ms" style={{ fontSize: '30px', color: m.color }}>{m.icon}</span>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>{v.nom}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-45)', marginBottom: '14px' }}>{v.nbVentes} ventes · {v.nbProduits} articles</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: m.color }}>{v.totalVentes.toLocaleString()}</div>
                <div style={{ fontSize: '11px', letterSpacing: '1px', color: 'var(--ink-45)', textTransform: 'uppercase' }}>FCFA réalisés</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table complète */}
      <div style={{ borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', overflow: 'hidden' }}>
       <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 60px', gap: '16px', padding: '14px 24px', background: 'var(--surface-inset)', borderBottom: '1px solid var(--line)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--ink-45)', minWidth: '640px' }}>
          <div>Rang</div><div>Vendeuse</div><div>Ventes FCFA</div><div>Transactions</div><div>Produits</div><div />
        </div>
        {vendeuses.map((v, i) => {
          const m = MEDALS[i];
          const rankStyle = m
            ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '10px', fontSize: '14px', fontWeight: 800, color: m.color, background: m.bg, border: `1px solid ${m.border}` }
            : { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, color: 'var(--ink-55)', background: 'var(--surface-inset)' };
          return (
            <div key={v.id}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 60px', gap: '16px', padding: '15px 24px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center', minWidth: '640px' }}>
                <div><span style={rankStyle as any}>{i + 1}</span></div>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)' }}>{v.nom}</div>
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--accent)' }}>{v.totalVentes.toLocaleString()}</div>
                <div style={{ fontSize: '14px', color: 'var(--ink-70)' }}>{v.nbVentes}</div>
                <div style={{ fontSize: '14px', color: 'var(--ink-70)' }}>{v.nbProduits}</div>
                <div>
                  <button onClick={() => voirDetail(v.id)} aria-label={`Voir le détail de ${v.nom}`} style={{ background: 'var(--accent-12)', border: '1px solid var(--accent-25)', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                    <span className="ms" style={{ fontSize: '18px', color: 'var(--accent)' }}>{detailOuvert === v.id ? 'expand_less' : 'expand_more'}</span>
                  </button>
                </div>
              </div>
              {detailOuvert === v.id && (
                <div style={{ padding: '16px 24px 20px', background: 'var(--surface-inset)', borderBottom: '1px solid var(--line-soft)' }}>
                  {chargementDetail ? (
                    <p style={{ color: 'var(--ink-45)', fontSize: '13px', textAlign: 'center' }}>Chargement...</p>
                  ) : ventesDetail.length === 0 ? (
                    <p style={{ color: 'var(--ink-45)', fontSize: '13px', textAlign: 'center' }}>Aucune vente.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {ventesDetail.map(vente => (
                        <div key={vente.id} style={{ padding: '14px 18px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{vente.cliente?.nom || 'Inconnue'}</div>
                              <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{new Date(vente.date_vente).toLocaleString('fr-FR')}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{vente.total?.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>FCFA</span></div>
                              <span style={vente.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{vente.statut_paiement === 'paye' ? 'Payé' : `Reste : ${vente.reste_a_payer?.toLocaleString()} FCFA`}</span>
                            </div>
                          </div>
                          {vente.vente_produits?.length > 0 && (
                            <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {vente.vente_produits.map((vp: any, j: number) => (
                                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                                  <span style={{ color: 'var(--ink-70)' }}>{vp.produits?.nom || 'Inconnu'} <span style={{ color: 'var(--accent)', fontWeight: 700 }}>x{vp.quantite}</span></span>
                                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{(vp.prix_unitaire * vp.quantite).toLocaleString()} FCFA</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
       </div>
      </div>
    </div>
  );
}
