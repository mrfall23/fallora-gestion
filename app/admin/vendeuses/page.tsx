'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const MEDALS = [
  { color: '#F0C040', bg: 'rgba(240,192,64,.14)', border: 'rgba(240,192,64,.4)', icon: 'emoji_events', cardBg: 'linear-gradient(180deg,rgba(240,192,64,.08),rgba(255,255,255,.02))' },
  { color: '#CDD0D6', bg: 'rgba(205,208,214,.12)', border: 'rgba(205,208,214,.35)', icon: 'workspace_premium', cardBg: 'linear-gradient(180deg,rgba(205,208,214,.05),rgba(255,255,255,.02))' },
  { color: '#D08B53', bg: 'rgba(208,139,83,.13)', border: 'rgba(208,139,83,.35)', icon: 'military_tech', cardBg: 'linear-gradient(180deg,rgba(208,139,83,.06),rgba(255,255,255,.02))' },
];

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: '#5BBF89', background: 'rgba(91,191,137,.13)', border: '1px solid rgba(91,191,137,.25)', padding: '4px 10px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: '#F0C040', background: 'rgba(240,192,64,.13)', border: '1px solid rgba(240,192,64,.28)', padding: '4px 10px', borderRadius: '20px' } as const;

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

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>Chargement...</div>;

  return (
    <div className="fade-up">
      {/* Podium top 3 */}
      {vendeuses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '18px', marginBottom: '24px' }}>
          {vendeuses.slice(0, 3).map((v, i) => {
            const m = MEDALS[i];
            return (
              <div key={v.id} style={{ padding: '24px', borderRadius: '20px', background: m.cardBg, border: `1px solid ${m.border}`, backdropFilter: 'blur(20px)', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.3)' }}>
                <div style={{ width: '58px', height: '58px', margin: '0 auto 14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.bg, border: `1.5px solid ${m.border}` }}>
                  <span className="ms" style={{ fontSize: '30px', color: m.color }}>{m.icon}</span>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#F5F5F0' }}>{v.nom}</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(245,245,240,.45)', marginBottom: '14px' }}>{v.nbVentes} ventes · {v.nbProduits} articles</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: m.color }}>{v.totalVentes.toLocaleString()}</div>
                <div style={{ fontSize: '11px', letterSpacing: '1px', color: 'rgba(245,245,240,.4)', textTransform: 'uppercase' }}>FCFA réalisés</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table complète */}
      <div style={{ borderRadius: '20px', background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 60px', gap: '16px', padding: '14px 24px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'rgba(245,245,240,.45)' }}>
          <div>Rang</div><div>Vendeuse</div><div>Ventes FCFA</div><div>Transactions</div><div>Produits</div><div />
        </div>
        {vendeuses.map((v, i) => {
          const m = MEDALS[i];
          const rankStyle = m
            ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '10px', fontSize: '14px', fontWeight: 800, color: m.color, background: m.bg, border: `1px solid ${m.border}` }
            : { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, color: 'rgba(245,245,240,.5)', background: 'rgba(255,255,255,.04)' };
          return (
            <div key={v.id}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1.6fr 1fr 1fr 1fr 60px', gap: '16px', padding: '15px 24px', borderBottom: '1px solid rgba(255,255,255,.04)', alignItems: 'center' }}>
                <div><span style={rankStyle as any}>{i + 1}</span></div>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#F5F5F0' }}>{v.nom}</div>
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#D4AF37' }}>{v.totalVentes.toLocaleString()}</div>
                <div style={{ fontSize: '14px', color: 'rgba(245,245,240,.7)' }}>{v.nbVentes}</div>
                <div style={{ fontSize: '14px', color: 'rgba(245,245,240,.7)' }}>{v.nbProduits}</div>
                <div>
                  <button onClick={() => voirDetail(v.id)} style={{ background: 'rgba(212,175,55,.1)', border: '1px solid rgba(212,175,55,.25)', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}>
                    <span className="ms" style={{ fontSize: '18px', color: '#F0C040' }}>{detailOuvert === v.id ? 'expand_less' : 'expand_more'}</span>
                  </button>
                </div>
              </div>
              {detailOuvert === v.id && (
                <div style={{ padding: '16px 24px 20px', background: 'rgba(255,255,255,.015)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  {chargementDetail ? (
                    <p style={{ color: 'rgba(245,245,240,.4)', fontSize: '13px', textAlign: 'center' }}>Chargement...</p>
                  ) : ventesDetail.length === 0 ? (
                    <p style={{ color: 'rgba(245,245,240,.4)', fontSize: '13px', textAlign: 'center' }}>Aucune vente.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {ventesDetail.map(vente => (
                        <div key={vente.id} style={{ padding: '14px 18px', borderRadius: '14px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: '#F5F5F0' }}>{vente.cliente?.nom || 'Inconnue'}</div>
                              <div style={{ fontSize: '12px', color: 'rgba(245,245,240,.4)' }}>{new Date(vente.date_vente).toLocaleString('fr-FR')}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: '#F5F5F0' }}>{vente.total?.toLocaleString()} <span style={{ fontSize: '11px', color: '#D4AF37' }}>FCFA</span></div>
                              <span style={vente.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{vente.statut_paiement === 'paye' ? 'Payé' : `Reste : ${vente.reste_a_payer?.toLocaleString()} FCFA`}</span>
                            </div>
                          </div>
                          {vente.vente_produits?.length > 0 && (
                            <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {vente.vente_produits.map((vp: any, j: number) => (
                                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                                  <span style={{ color: 'rgba(245,245,240,.7)' }}>{vp.produits?.nom || 'Inconnu'} <span style={{ color: '#D4AF37', fontWeight: 700 }}>x{vp.quantite}</span></span>
                                  <span style={{ color: '#F5F5F0', fontWeight: 600 }}>{(vp.prix_unitaire * vp.quantite).toLocaleString()} FCFA</span>
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
  );
}
