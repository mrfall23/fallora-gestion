'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Cliente = { id: number; nom: string; telephone: string | null; created_at: string; nbVentes: number; totalDepense: number; resteAPayer: number; derniereVisite: string | null };

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: '#5BBF89', background: 'rgba(91,191,137,.13)', border: '1px solid rgba(91,191,137,.25)', padding: '4px 10px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: '#F0C040', background: 'rgba(240,192,64,.13)', border: '1px solid rgba(240,192,64,.28)', padding: '4px 10px', borderRadius: '20px' } as const;

export default function AdminClients() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [clienteSelectee, setClienteSelectee] = useState<Cliente | null>(null);
  const [ventesCliente, setVentesCliente] = useState<any[]>([]);
  const [chargementDetail, setChargementDetail] = useState(false);

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { icon: 'people', label: 'Clientes', value: clientes.length.toString(), color: '#F5F5F0' },
          { icon: 'payments', label: 'CA Total FCFA', value: totalCA.toLocaleString(), color: '#5BBF89' },
          { icon: 'pending_actions', label: 'En attente FCFA', value: totalAttente.toLocaleString(), color: '#F0C040' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '18px', background: 'rgba(255,255,255,.035)', border: '1px solid rgba(212,175,55,.12)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(240,192,64,.18),rgba(212,175,55,.06))', border: '1px solid rgba(212,175,55,.2)', flexShrink: 0 }}>
              <span className="ms" style={{ fontSize: '22px', color: '#F0C040' }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'rgba(245,245,240,.5)', textTransform: 'uppercase' as const }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '48px', padding: '0 16px', borderRadius: '14px', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)', marginBottom: '16px' }}>
        <span className="ms" style={{ fontSize: '20px', color: 'rgba(245,245,240,.4)' }}>search</span>
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher par nom ou téléphone..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F5F5F0', fontSize: '14px' }} />
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: clienteSelectee ? '1fr 380px' : '1fr', gap: '16px', alignItems: 'start' }}>
        {/* Liste */}
        <div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>Chargement...</div>
          ) : filtrees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>
              <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'rgba(212,175,55,.3)' }}>people</span>
              {recherche ? 'Aucune cliente trouvée.' : 'Aucune cliente enregistrée.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtrees.map(c => (
                <button key={c.id} onClick={() => voirDetail(c)} style={{ width: '100%', padding: '16px 20px', borderRadius: '18px', background: clienteSelectee?.id === c.id ? 'rgba(212,175,55,.08)' : 'rgba(255,255,255,.035)', border: `1px solid ${clienteSelectee?.id === c.id ? 'rgba(212,175,55,.35)' : 'rgba(255,255,255,.06)'}`, backdropFilter: 'blur(20px)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(135deg,#262420,#191815)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,.2)', flexShrink: 0 }}>
                        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', color: '#D4AF37', fontWeight: 600 }}>{c.nom[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#F5F5F0' }}>{c.nom}</div>
                        {c.telephone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'rgba(245,245,240,.4)' }}>
                            <span className="ms" style={{ fontSize: '13px' }}>phone</span>{c.telephone}
                          </div>
                        ) : <div style={{ fontSize: '12px', color: 'rgba(245,245,240,.25)' }}>Pas de téléphone</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#F5F5F0' }}>{c.totalDepense.toLocaleString()} <span style={{ fontSize: '11px', color: '#D4AF37' }}>FCFA</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <span style={{ fontSize: '11.5px', background: 'rgba(212,175,55,.12)', color: '#D4AF37', padding: '3px 9px', borderRadius: '20px', fontWeight: 600 }}>{c.nbVentes} achat{c.nbVentes > 1 ? 's' : ''}</span>
                        {c.resteAPayer > 0 && <span style={{ fontSize: '11.5px', background: 'rgba(240,192,64,.13)', color: '#F0C040', padding: '3px 9px', borderRadius: '20px', fontWeight: 600 }}>-{c.resteAPayer.toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                  {c.derniereVisite && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px', fontSize: '11.5px', color: 'rgba(245,245,240,.35)' }}>
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
          <div style={{ position: 'sticky', top: '100px', borderRadius: '20px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(212,175,55,.2)', backdropFilter: 'blur(22px)', boxShadow: '0 12px 40px rgba(0,0,0,.35)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,rgba(212,175,55,.15),rgba(212,175,55,.05))', padding: '20px', borderBottom: '1px solid rgba(212,175,55,.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '15px', background: 'linear-gradient(135deg,#2e271c,#1a1a18)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,.3)' }}>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '26px', color: '#D4AF37', fontWeight: 600 }}>{clienteSelectee.nom[0].toUpperCase()}</span>
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: '#F5F5F0' }}>{clienteSelectee.nom}</div>
                  {clienteSelectee.telephone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: '#D4AF37' }}>
                      <span className="ms" style={{ fontSize: '14px' }}>phone</span>{clienteSelectee.telephone}
                    </div>
                  ) : <div style={{ fontSize: '12px', color: 'rgba(245,245,240,.35)' }}>Pas de téléphone</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                {[
                  { label: 'Achats', value: clienteSelectee.nbVentes.toString() },
                  { label: 'Total FCFA', value: clienteSelectee.totalDepense.toLocaleString() },
                  { label: 'Reste', value: clienteSelectee.resteAPayer.toLocaleString(), warn: clienteSelectee.resteAPayer > 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(0,0,0,.2)', borderRadius: '12px', padding: '10px', textAlign: 'center', border: `1px solid ${s.warn ? 'rgba(240,192,64,.3)' : 'rgba(255,255,255,.06)'}` }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: s.warn ? '#F0C040' : '#F5F5F0' }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(245,245,240,.45)', fontWeight: 600, letterSpacing: '.3px', textTransform: 'uppercase' as const }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: '#F5F5F0' }}>
                <span className="ms" style={{ fontSize: '18px', color: '#F0C040' }}>shopping_bag</span>Historique
              </div>
              {chargementDetail ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(245,245,240,.4)', fontSize: '13px' }}>Chargement...</div>
              ) : ventesCliente.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(245,245,240,.4)', fontSize: '13px' }}>Aucun achat.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                  {ventesCliente.map(v => (
                    <div key={v.id} style={{ padding: '12px 14px', borderRadius: '14px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'rgba(245,245,240,.4)' }}>{new Date(v.date_vente).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                          <div style={{ fontSize: '11.5px', color: 'rgba(245,245,240,.35)' }}>par {v.utilisateurs?.nom || 'Inconnue'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#F5F5F0' }}>{v.total?.toLocaleString()} <span style={{ fontSize: '10px', color: '#D4AF37' }}>FCFA</span></div>
                          <span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : `Reste : ${v.reste_a_payer?.toLocaleString()}`}</span>
                        </div>
                      </div>
                      {v.vente_produits?.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {v.vente_produits.map((vp: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                              <span style={{ color: 'rgba(245,245,240,.6)' }}>{vp.produits?.nom || 'Inconnu'} <span style={{ color: '#D4AF37', fontWeight: 700 }}>x{vp.quantite}</span></span>
                              <span style={{ color: '#F5F5F0', fontWeight: 600 }}>{(vp.prix_unitaire * vp.quantite).toLocaleString()}</span>
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
