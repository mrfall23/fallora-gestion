'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Vente = { id: number; total: number; montant_paye: number; reste_a_payer: number; statut_paiement: string; date_vente: string; vendeuseNom: string; clienteNom: string };
type Groupe = { cle: string; titre: string; sousTitre: string; active?: boolean; ventes: Vente[] };

const BADGE_PAID = { fontSize: '11px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '3px 9px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '11px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '3px 9px', borderRadius: '20px' } as const;

const moisKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const moisLabel = (key: string) => { const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
const lundiDe = (d: Date) => { const x = new Date(d); const jour = (x.getDay() + 6) % 7; x.setDate(x.getDate() - jour); x.setHours(0, 0, 0, 0); return x; };
const fmtDate = (s: string | Date) => new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AdminCalendrier() {
  const [periodes, setPeriodes] = useState<any[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [vue, setVue] = useState<'periode' | 'mois' | 'semaine'>('periode');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => { charger(); }, []);

  const charger = async () => {
    const [{ data: per }, { data: v }] = await Promise.all([
      supabase.from('periodes').select('*').order('debut', { ascending: false }),
      supabase.from('ventes').select('id, total, montant_paye, reste_a_payer, statut_paiement, date_vente, vendeuse_id, cliente_id').eq('annulee', false).order('date_vente', { ascending: false }),
    ]);
    const ventesData = v || [];
    const userIds = [...new Set(ventesData.map((x: any) => x.vendeuse_id).filter(Boolean))];
    const clienteIds = [...new Set(ventesData.map((x: any) => x.cliente_id).filter(Boolean))];
    const [{ data: users }, { data: clientes }] = await Promise.all([
      userIds.length ? supabase.from('utilisateurs').select('id, nom').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
      clienteIds.length ? supabase.from('clientes').select('id, nom').in('id', clienteIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    setPeriodes(per || []);
    setVentes(ventesData.map((x: any) => ({
      ...x,
      vendeuseNom: (users || []).find((u: any) => u.id === x.vendeuse_id)?.nom || 'Inconnue',
      clienteNom: (clientes || []).find((c: any) => c.id === x.cliente_id)?.nom || 'Inconnue',
    })));
    setChargement(false);
  };

  const construireGroupes = (): Groupe[] => {
    if (vue === 'periode') {
      return periodes.map(p => {
        const debut = new Date(p.debut); const fin = p.fin ? new Date(p.fin) : null;
        const vv = ventes.filter(v => { const d = new Date(v.date_vente); return d >= debut && (!fin || d < fin); });
        return { cle: `p-${p.id}`, titre: p.nom, sousTitre: `${fmtDate(debut)} — ${fin ? fmtDate(fin) : 'en cours'}`, active: !fin, ventes: vv };
      });
    }
    const map = new Map<string, { cle: string; titre: string; tri: string; ventes: Vente[] }>();
    ventes.forEach(v => {
      const d = new Date(v.date_vente);
      let cle: string, titre: string;
      if (vue === 'mois') { cle = moisKey(d); titre = moisLabel(cle); }
      else { const l = lundiDe(d); cle = l.toISOString().slice(0, 10); titre = `Semaine du ${l.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}`; }
      if (!map.has(cle)) map.set(cle, { cle, titre, tri: cle, ventes: [] });
      map.get(cle)!.ventes.push(v);
    });
    return [...map.values()].sort((a, b) => b.tri.localeCompare(a.tri)).map(g => ({ cle: g.cle, titre: g.titre, sousTitre: `${g.ventes.length} vente${g.ventes.length > 1 ? 's' : ''}`, ventes: g.ventes }));
  };

  const groupes = construireGroupes();
  const somme = (vv: Vente[], champ: keyof Vente) => vv.reduce((s, v) => s + (Number(v[champ]) || 0), 0);

  const ONGLETS: { cle: typeof vue; label: string; icon: string }[] = [
    { cle: 'periode', label: 'Par période', icon: 'event_available' },
    { cle: 'mois', label: 'Par mois', icon: 'calendar_month' },
    { cle: 'semaine', label: 'Par semaine', icon: 'date_range' },
  ];

  return (
    <div className="fade-up">
      {/* Onglets */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {ONGLETS.map(o => {
          const actif = vue === o.cle;
          return (
            <button key={o.cle} onClick={() => { setVue(o.cle); setOuvert(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 16px', borderRadius: '13px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 700, background: actif ? 'var(--accent-16)' : 'var(--surface)', color: actif ? 'var(--accent-deep)' : 'var(--ink-55)', border: `1px solid ${actif ? 'var(--accent-25)' : 'var(--line)'}` }}>
              <span className="ms" style={{ fontSize: '19px', color: actif ? 'var(--accent)' : 'var(--ink-45)' }}>{o.icon}</span>{o.label}
            </button>
          );
        })}
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>
      ) : groupes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>calendar_month</span>
          Aucune vente pour le moment.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {groupes.map(g => {
            const ca = somme(g.ventes, 'total');
            const encaisse = somme(g.ventes, 'montant_paye');
            const attente = somme(g.ventes, 'reste_a_payer');
            const estOuvert = ouvert === g.cle;
            return (
              <div key={g.cle} style={{ borderRadius: '18px', background: 'var(--surface)', border: `1px solid ${g.active ? 'var(--accent-25)' : 'var(--line)'}`, overflow: 'hidden' }}>
                <button onClick={() => setOuvert(estOuvert ? null : g.cle)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{g.titre}</span>
                      {g.active && <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--accent-deep)', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', padding: '2px 8px', borderRadius: '20px' }}>EN COURS</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-45)', marginTop: '2px' }}>{g.sousTitre} · {g.ventes.length} vente{g.ventes.length > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{ca.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>FCFA</span></div>
                    {attente > 0 && <div style={{ fontSize: '11.5px', color: 'var(--warn)', fontWeight: 600 }}>reste {attente.toLocaleString()}</div>}
                  </div>
                  <span className="ms" style={{ fontSize: '22px', color: 'var(--ink-45)', transform: estOuvert ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>expand_more</span>
                </button>
                {estOuvert && (
                  <div style={{ borderTop: '1px solid var(--line-soft)', padding: '8px 12px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', margin: '8px 4px 12px' }}>
                      {[{ l: 'Chiffre', v: ca, c: 'var(--ink)' }, { l: 'Encaissé', v: encaisse, c: 'var(--success)' }, { l: 'En attente', v: attente, c: 'var(--warn)' }].map(s => (
                        <div key={s.l} style={{ textAlign: 'center', padding: '10px', borderRadius: '12px', background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: s.c }}>{s.v.toLocaleString()}</div>
                          <div style={{ fontSize: '10px', color: 'var(--ink-45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    {g.ventes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px', color: 'var(--ink-45)', fontSize: '13px' }}>Aucune vente sur cette période.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
                        {g.ventes.map(v => (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '11px', background: 'var(--surface-inset)' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.clienteNom}</div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-45)' }}>{fmtDate(v.date_vente)} · {v.vendeuseNom}</div>
                            </div>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{v.total?.toLocaleString()}</div>
                            <span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : 'Partiel'}</span>
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
      )}
    </div>
  );
}
