'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '../../components/useMediaQuery';

type Cliente = { id: number; nom: string; telephone: string | null; created_at: string; nbVentes: number; totalDepense: number; resteAPayer: number; derniereVisite: string | null };

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '4px 10px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '4px 10px', borderRadius: '20px' } as const;

export default function AdminClients() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [clienteSelectee, setClienteSelectee] = useState<Cliente | null>(null);
  const [ventesCliente, setVentesCliente] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => { chargerClientes(); }, []);

  const chargerClientes = async () => {
    const { data: clientesData } = await supabase.from('clientes').select('*').order('nom');
    if (!clientesData || clientesData.length === 0) { setClientes([]); setChargement(false); return; }
    const clienteIds = clientesData.map((c: any) => c.id);
    const { data: ventes } = await supabase.from('ventes').select('id, cliente_id, total, reste_a_payer, date_vente').eq('annulee', false).in('cliente_id', clienteIds);
    setClientes(clientesData.map((c: any) => {
      const vv = (ventes || []).filter((v: any) => v.cliente_id === c.id);
      const dates = vv.map((v: any) => v.date_vente).sort().reverse();
      return { ...c, nbVentes: vv.length, totalDepense: vv.reduce((s: number, v: any) => s + v.total, 0), resteAPayer: vv.reduce((s: number, v: any) => s + v.reste_a_payer, 0), derniereVisite: dates[0] || null };
    }));
    setChargement(false);
  };

  const voirDetail = async (c: Cliente) => {
    if (clienteSelectee?.id === c.id) { setClienteSelectee(null); setVentesCliente([]); return; }
    setClienteSelectee(c); setChargementDetail(true);
    const { data: ventesData } = await supabase.from('ventes').select('*').eq('cliente_id', c.id).eq('annulee', false).order('date_vente', { ascending: false });
    if (!ventesData || ventesData.length === 0) { setVentesCliente([]); setChargementDetail(false); return; }
    const venteIds = ventesData.map((v: any) => v.id);
    const { data: vp } = await supabase.from('vente_produits').select('*').in('vente_id', venteIds);
    const produitIds = [...new Set((vp || []).map((x: any) => x.produit_id))];
    const { data: produits } = produitIds.length > 0 ? await supabase.from('produits').select('id, nom').in('id', produitIds) : { data: [] };
    const userIds = [...new Set(ventesData.map((v: any) => v.vendeuse_id))];
    const { data: utilisateurs } = userIds.length > 0 ? await supabase.from('utilisateurs').select('id, nom').in('id', userIds) : { data: [] };
    setVentesCliente(ventesData.map((v: any) => ({ ...v, utilisateurs: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null, vente_produits: (vp || []).filter((x: any) => x.vente_id === v.id).map((x: any) => ({ ...x, produits: (produits || []).find((p: any) => p.id === x.produit_id) || null })) })));
    setChargementDetail(false);
  };

  const filtrees = clientes.filter(c => c.nom.toLowerCase().includes(recherche.toLowerCase()) || (c.telephone && c.telephone.includes(recherche)));
  const totalCA = clientes.reduce((s, c) => s + c.totalDepense, 0);
  const totalAttente = clientes.reduce((s, c) => s + c.resteAPayer, 0);

  return (
    <div className="fade-up">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '16px', marginBottom: '20px' }}>
        {[
          { icon: 'people', label: 'Clientes', value: clientes.length.toString(), color: 'var(--ink)' },
          { icon: 'payments', label: 'CA Total FCFA', value: totalCA.toLocaleString(), color: 'var(--success)' },
          { icon: 'pending_actions', label: 'En attente FCFA', value: totalAttente.toLocaleString(), color: 'var(--warn)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
              <span className="ms" style={{ fontSize: '22px', color: 'var(--accent)' }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' as const }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '48px', padding: '0 16px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)', marginBottom: '16px' }}>
        <span className="ms" style={{ fontSize: '20px', color: 'var(--ink-45)' }}>search</span>
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher par nom ou téléphone..." aria-label="Rechercher une cliente" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: '14px' }} />
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: clienteSelectee && !isMobile ? '1fr 380px' : '1fr', gap: '16px', alignItems: 'start' }}>
        {/* Liste */}
        <div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>
          ) : filtrees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>
              <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>people</span>
              {recherche ? 'Aucune cliente trouvée.' : 'Aucune cliente enregistrée.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtrees.map(c => (
                <button key={c.id} onClick={() => voirDetail(c)} style={{ width: '100%', padding: '16px 20px', borderRadius: '18px', background: clienteSelectee?.id === c.id ? 'var(--accent-08)' : 'var(--surface)', border: `1px solid ${clienteSelectee?.id === c.id ? 'var(--accent-30)' : 'var(--line)'}`, backdropFilter: 'blur(20px)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '20px', color: 'var(--accent)', fontWeight: 600 }}>{c.nom[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)' }}>{c.nom}</div>
                        {c.telephone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--ink-45)' }}>
                            <span className="ms" style={{ fontSize: '13px' }}>phone</span>{c.telephone}
                          </div>
                        ) : <div style={{ fontSize: '12px', color: 'var(--ink-25)' }}>Pas de téléphone</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{c.totalDepense.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>FCFA</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <span style={{ fontSize: '11.5px', background: 'var(--accent-12)', color: 'var(--accent-deep)', padding: '3px 9px', borderRadius: '20px', fontWeight: 600 }}>{c.nbVentes} achat{c.nbVentes > 1 ? 's' : ''}</span>
                        {c.resteAPayer > 0 && <span style={{ fontSize: '11.5px', background: 'var(--warn-tint)', color: 'var(--warn)', padding: '3px 9px', borderRadius: '20px', fontWeight: 600 }}>-{c.resteAPayer.toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                  {c.derniereVisite && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px', fontSize: '11.5px', color: 'var(--ink-35)' }}>
                      <span className="ms" style={{ fontSize: '13px' }}>schedule</span>
                      Dernière visite : {new Date(c.derniereVisite).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {clienteSelectee && (
          <div style={{ position: isMobile ? 'static' : 'sticky', top: '100px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(22px)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,var(--accent-16),var(--accent-08))', padding: '20px', borderBottom: '1px solid var(--accent-12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-30)' }}>
                  <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '26px', color: 'var(--accent)', fontWeight: 600 }}>{clienteSelectee.nom[0].toUpperCase()}</span>
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>{clienteSelectee.nom}</div>
                  {clienteSelectee.telephone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--accent)' }}>
                      <span className="ms" style={{ fontSize: '14px' }}>phone</span>{clienteSelectee.telephone}
                    </div>
                  ) : <div style={{ fontSize: '12px', color: 'var(--ink-35)' }}>Pas de téléphone</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                {[
                  { label: 'Achats', value: clienteSelectee.nbVentes.toString() },
                  { label: 'Total FCFA', value: clienteSelectee.totalDepense.toLocaleString() },
                  { label: 'Reste', value: clienteSelectee.resteAPayer.toLocaleString(), warn: clienteSelectee.resteAPayer > 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface)', borderRadius: '12px', padding: '10px', textAlign: 'center', border: `1px solid ${s.warn ? 'var(--warn-line)' : 'var(--line)'}` }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: s.warn ? 'var(--warn)' : 'var(--ink)' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink-45)', fontWeight: 600, letterSpacing: '.3px', textTransform: 'uppercase' as const }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                <span className="ms" style={{ fontSize: '18px', color: 'var(--accent)' }}>shopping_bag</span>Historique
              </div>
              {chargementDetail ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink-45)', fontSize: '13px' }}>Chargement...</div>
              ) : ventesCliente.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink-45)', fontSize: '13px' }}>Aucun achat.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                  {ventesCliente.map(v => (
                    <div key={v.id} style={{ padding: '12px 14px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{new Date(v.date_vente).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-35)' }}>par {v.utilisateurs?.nom || 'Inconnue'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{v.total?.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--accent)' }}>FCFA</span></div>
                          <span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : `Reste : ${v.reste_a_payer?.toLocaleString()}`}</span>
                        </div>
                      </div>
                      {v.vente_produits?.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {v.vente_produits.map((vp: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                              <span style={{ color: 'var(--ink-70)' }}>{vp.produits?.nom || 'Inconnu'} <span style={{ color: 'var(--accent)', fontWeight: 700 }}>x{vp.quantite}</span></span>
                              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{(vp.prix_unitaire * vp.quantite).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
