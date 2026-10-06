'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire, lireParIds } from '@/lib/requetes';

const MEDALS = [
  { color: '#B8912E', bg: 'rgba(184,145,46,.14)', border: 'rgba(184,145,46,.4)', icon: 'emoji_events', cardBg: 'linear-gradient(180deg,rgba(184,145,46,.10),var(--surface))' },
  { color: '#8C9099', bg: 'rgba(140,144,153,.14)', border: 'rgba(140,144,153,.38)', icon: 'workspace_premium', cardBg: 'linear-gradient(180deg,rgba(140,144,153,.08),var(--surface))' },
  { color: '#A5673B', bg: 'rgba(165,103,59,.15)', border: 'rgba(165,103,59,.38)', icon: 'military_tech', cardBg: 'linear-gradient(180deg,rgba(165,103,59,.10),var(--surface))' },
];

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '4px 10px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '4px 10px', borderRadius: '20px' } as const;

// Bornes du mois courant (heure locale du navigateur = heure Cameroun).
const debutMoisCourant = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); };
const periodeCourante = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`; };
const nomDuMois = () => new Date().toLocaleDateString('fr-FR', { month: 'long' });

export default function AdminVendeuses() {
  const [vendeuses, setVendeuses] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [detailOuvert, setDetailOuvert] = useState<number | null>(null);
  const [ventesDetail, setVentesDetail] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);
  const [objectifEdite, setObjectifEdite] = useState<number | null>(null);
  const [valeurObjectif, setValeurObjectif] = useState('');
  const [sauvegardeObj, setSauvegardeObj] = useState(false);

  useEffect(() => {
    chargerVendeuses();
    const canal = supabase.channel('vendeuses').on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => chargerVendeuses()).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  const chargerVendeuses = async () => {
    const { data: utilisateurs } = await supabase.from('utilisateurs').select('*').eq('role', 'vendeuse').eq('actif', true);
    const ventes = await toutLire(() => supabase.from('ventes').select('id, vendeuse_id, total, montant_paye, date_vente').eq('annulee', false).order('id'));
    const { data: objectifs } = await supabase.from('objectifs_vendeuses').select('vendeuse_id, objectif').eq('periode', periodeCourante());
    const debutMois = debutMoisCourant();
    const venteProduits = await lireParIds('vente_produits', 'vente_id, quantite', 'vente_id', ventes.map((v: any) => v.id));
    const qteParVente = new Map<number, number>();
    for (const vp of venteProduits) qteParVente.set(vp.vente_id, (qteParVente.get(vp.vente_id) || 0) + vp.quantite);
    const result = (utilisateurs || []).map((u: any) => {
      const vv = ventes.filter((v: any) => v.vendeuse_id === u.id);
      const realiseMois = vv.filter((v: any) => new Date(v.date_vente) >= debutMois).reduce((s: number, v: any) => s + v.total, 0);
      const objectif = Number((objectifs || []).find((o: any) => o.vendeuse_id === u.id)?.objectif) || 0;
      return { ...u, totalVentes: vv.reduce((s: number, v: any) => s + v.total, 0), totalEncaisse: vv.reduce((s: number, v: any) => s + v.montant_paye, 0), nbVentes: vv.length, nbProduits: vv.reduce((s: number, v: any) => s + (qteParVente.get(v.id) || 0), 0), realiseMois, objectif };
    }).sort((a: any, b: any) => b.totalVentes - a.totalVentes);
    setVendeuses(result);
    setChargement(false);
  };

  const enregistrerObjectif = async (vendeuseId: number) => {
    setSauvegardeObj(true);
    const objectif = Math.max(0, Number(valeurObjectif) || 0);
    await supabase.from('objectifs_vendeuses').upsert({ vendeuse_id: vendeuseId, periode: periodeCourante(), objectif }, { onConflict: 'vendeuse_id,periode' });
    setSauvegardeObj(false);
    setObjectifEdite(null);
    await chargerVendeuses();
  };

  const voirDetail = async (vendeuseId: number) => {
    if (detailOuvert === vendeuseId) { setDetailOuvert(null); setVentesDetail([]); return; }
    setDetailOuvert(vendeuseId); setChargementDetail(true);
    const ventesData = await toutLire(() => supabase.from('ventes').select('*').eq('vendeuse_id', vendeuseId).eq('annulee', false).order('date_vente', { ascending: false }).order('id', { ascending: false }));
    if (ventesData.length === 0) { setVentesDetail([]); setChargementDetail(false); return; }
    const [clientes, vp] = await Promise.all([
      lireParIds('clientes', 'id, nom', 'id', ventesData.map((v: any) => v.cliente_id)),
      lireParIds('vente_produits', '*', 'vente_id', ventesData.map((v: any) => v.id)),
    ]);
    const produits = await lireParIds('produits', 'id, nom', 'id', vp.map((x: any) => x.produit_id));
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
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)' }}>{v.nom}</div>
                  {v.objectif > 0 && (() => {
                    const pct = Math.min(100, Math.round((v.realiseMois / v.objectif) * 100));
                    const atteint = v.realiseMois >= v.objectif;
                    return (
                      <div style={{ marginTop: '5px', maxWidth: '180px' }}>
                        <div style={{ height: '5px', borderRadius: '20px', background: 'var(--surface-inset)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '20px', background: atteint ? 'var(--success)' : 'var(--accent)' }} />
                        </div>
                        <div style={{ fontSize: '10.5px', color: atteint ? 'var(--success)' : 'var(--ink-45)', fontWeight: 600, marginTop: '3px' }}>{atteint ? '🎯 Objectif atteint' : `${pct}% de l'objectif`}</div>
                      </div>
                    );
                  })()}
                </div>
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
                  {/* Objectif du mois */}
                  <div style={{ padding: '16px 18px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
                        <span className="ms" style={{ fontSize: '18px', color: 'var(--accent)' }}>flag</span>Objectif de {nomDuMois()}
                      </div>
                      {objectifEdite !== v.id && (
                        <button onClick={() => { setObjectifEdite(v.id); setValeurObjectif(v.objectif ? String(v.objectif) : ''); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-08)', border: '1px solid var(--accent-20)', borderRadius: '9px', padding: '6px 12px', cursor: 'pointer' }}>
                          <span className="ms" style={{ fontSize: '15px' }}>edit</span>{v.objectif > 0 ? 'Modifier' : 'Définir'}
                        </button>
                      )}
                    </div>
                    {objectifEdite === v.id ? (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input type="number" inputMode="numeric" value={valeurObjectif} onChange={e => setValeurObjectif(e.target.value)} placeholder="Objectif en FCFA" aria-label="Objectif en FCFA" style={{ flex: 1, minWidth: '140px', height: '40px', padding: '0 14px', borderRadius: '10px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px' }} />
                        <button onClick={() => enregistrerObjectif(v.id)} disabled={sauvegardeObj} style={{ height: '40px', padding: '0 18px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--accent)', color: 'var(--on-accent)', opacity: sauvegardeObj ? 0.6 : 1 }}>{sauvegardeObj ? '...' : 'Enregistrer'}</button>
                        <button onClick={() => setObjectifEdite(null)} disabled={sauvegardeObj} style={{ height: '40px', padding: '0 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'var(--surface-inset)', color: 'var(--ink-55)', border: '1px solid var(--line)' }}>Annuler</button>
                      </div>
                    ) : v.objectif > 0 ? (() => {
                      const pct = Math.min(100, Math.round((v.realiseMois / v.objectif) * 100));
                      const atteint = v.realiseMois >= v.objectif;
                      const reste = Math.max(0, v.objectif - v.realiseMois);
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px', fontSize: '13px' }}>
                            <span style={{ color: 'var(--ink-70)' }}>Réalisé : <b style={{ color: 'var(--ink)' }}>{v.realiseMois.toLocaleString()}</b> / {v.objectif.toLocaleString()} FCFA</span>
                            <span style={{ fontWeight: 700, color: atteint ? 'var(--success)' : 'var(--accent)' }}>{pct}%</span>
                          </div>
                          <div style={{ height: '9px', borderRadius: '20px', background: 'var(--surface-inset)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '20px', background: atteint ? 'var(--success)' : 'var(--accent-grad)' }} />
                          </div>
                          <div style={{ fontSize: '12px', color: atteint ? 'var(--success)' : 'var(--ink-45)', fontWeight: 600, marginTop: '6px' }}>{atteint ? '🎯 Objectif atteint, bravo !' : `Il reste ${reste.toLocaleString()} FCFA à réaliser`}</div>
                        </div>
                      );
                    })() : (
                      <div style={{ fontSize: '13px', color: 'var(--ink-45)' }}>Aucun objectif fixé pour ce mois.</div>
                    )}
                  </div>
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
