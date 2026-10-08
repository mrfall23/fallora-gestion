'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SEUIL_STOCK_BAS } from '@/lib/constantes';

const BADGE_UP = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', padding: '3px 9px', borderRadius: '8px' } as const;
const BADGE_WARN = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', padding: '3px 9px', borderRadius: '8px' } as const;
const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '5px 12px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '5px 12px', borderRadius: '20px' } as const;

const MODE_LABELS: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };
const moisLabel = () => new Date().toLocaleDateString('fr-FR', { month: 'long' });

// Variation en % du mois courant vs mois precedent. null si pas de reference.
function calculerDelta(courant: number, precedent: number): number | null {
  if (precedent <= 0) return courant > 0 ? 100 : null;
  return Math.round(((courant - precedent) / precedent) * 100);
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalVentes: 0, totalProduits: 0, stockRestant: 0, paiementsEnAttente: 0 });
  const [ventesRecentes, setVentesRecentes] = useState<any[]>([]);
  const [topVendeuses, setTopVendeuses] = useState<any[]>([]);
  const [stockBas, setStockBas] = useState<any[]>([]);
  const [comparatif, setComparatif] = useState({ caMois: 0, nbMois: 0, caMoisPrec: 0, nbMoisPrec: 0 });
  const [caParMode, setCaParMode] = useState<{ mode: string; total: number }[]>([]);
  const [produitsCa, setProduitsCa] = useState<{ nom: string; quantite: number; ca: number }[]>([]);
  const [marge, setMarge] = useState({ beneficeMois: 0, caCouvertMois: 0, beneficeMoisPrec: 0 });
  const [produitsMarge, setProduitsMarge] = useState<{ nom: string; quantite: number; ca: number; benefice: number }[]>([]);
  const [periode, setPeriode] = useState<{ id: number | null; nom: string; debut: string | null }>({ id: null, nom: 'Période en cours', debut: null });
  const [clotureOuverte, setClotureOuverte] = useState(false);
  const [nomPeriode, setNomPeriode] = useState('');
  const [cloture, setCloture] = useState(false);
  const [erreurCloture, setErreurCloture] = useState('');

  useEffect(() => {
    chargerStats();
    chargerStockBas();
    const canal = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => { chargerStats(); chargerStockBas(); })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  // Produits actifs sous le seuil, du plus critique (epuise) au moins critique.
  const chargerStockBas = async () => {
    const { data } = await supabase.from('produits').select('id, nom, stock_restant').eq('actif', true).lte('stock_restant', SEUIL_STOCK_BAS).order('stock_restant', { ascending: true });
    setStockBas(data || []);
  };

  // Une seule RPC, tout est agrege cote base (appliquee en prod).
  const chargerStats = async () => {
    const { data, error } = await supabase.rpc('tableau_de_bord_admin');
    if (error || !data) {
      console.warn('RPC tableau_de_bord_admin indisponible.', error?.message);
      return;
    }
    const d = data as any;
    setStats({
      totalVentes: Number(d.stats.total_ventes) || 0,
      totalProduits: Number(d.stats.produits_vendus) || 0,
      stockRestant: Number(d.stats.stock_restant) || 0,
      paiementsEnAttente: Number(d.stats.paiements_en_attente) || 0,
    });
    setVentesRecentes((d.ventes_recentes || []).map((v: any) => ({
      id: v.id, clienteNom: v.cliente_nom || 'Inconnue', vendeuseNom: v.vendeuse_nom || 'Inconnue',
      total: Number(v.total) || 0, statut_paiement: v.statut_paiement,
    })));
    setTopVendeuses((d.top_vendeuses || []).map((v: any) => ({
      id: v.id, nom: v.nom, nb: Number(v.nb) || 0, total: Number(v.total) || 0,
    })));
    const c = d.comparatif || {};
    setComparatif({
      caMois: Number(c.ca_mois) || 0, nbMois: Number(c.nb_mois) || 0,
      caMoisPrec: Number(c.ca_mois_prec) || 0, nbMoisPrec: Number(c.nb_mois_prec) || 0,
    });
    setCaParMode((d.ca_par_mode || []).map((m: any) => ({ mode: m.mode, total: Number(m.total) || 0 })));
    setProduitsCa((d.produits_ca || []).map((p: any) => ({ nom: p.nom, quantite: Number(p.quantite) || 0, ca: Number(p.ca) || 0 })));
    const m = d.marge || {};
    setMarge({ beneficeMois: Number(m.benefice_mois) || 0, caCouvertMois: Number(m.ca_couvert_mois) || 0, beneficeMoisPrec: Number(m.benefice_mois_prec) || 0 });
    setProduitsMarge((d.produits_marge || []).map((p: any) => ({ nom: p.nom, quantite: Number(p.quantite) || 0, ca: Number(p.ca) || 0, benefice: Number(p.benefice) || 0 })));
    const pr = d.periode || {};
    setPeriode({ id: pr.id ?? null, nom: pr.nom || 'Période en cours', debut: pr.debut || null });
  };

  // Cloture : archive la periode en cours et repart a zero (rien n'est supprime).
  const cloturerPeriode = async () => {
    setCloture(true); setErreurCloture('');
    const { error } = await supabase.rpc('cloturer_periode', { p_nom: nomPeriode.trim() || null });
    setCloture(false);
    if (error) { setErreurCloture(error.message || 'Échec de la clôture.'); return; }
    setClotureOuverte(false); setNomPeriode('');
    chargerStats(); chargerStockBas();
  };

  const STATS_CARDS = [
    { icon: 'payments', label: 'Total des ventes', value: stats.totalVentes.toLocaleString(), unit: 'FCFA', sub: 'Temps réel', subStyle: BADGE_UP },
    { icon: 'shopping_bag', label: 'Produits vendus', value: stats.totalProduits.toString(), unit: 'unités', sub: 'En cours', subStyle: BADGE_UP },
    { icon: 'inventory', label: 'Stock restant', value: stats.stockRestant.toString(), unit: 'articles', sub: 'En stock', subStyle: BADGE_WARN },
    { icon: 'pending_actions', label: 'Paiements en attente', value: stats.paiementsEnAttente.toLocaleString(), unit: 'FCFA', sub: 'À encaisser', subStyle: BADGE_WARN },
  ];

  const medals = [
    { color: '#B8912E', bg: 'rgba(184,145,46,.14)', border: 'rgba(184,145,46,.4)', icon: 'emoji_events' },
    { color: '#8C9099', bg: 'rgba(140,144,153,.14)', border: 'rgba(140,144,153,.38)', icon: 'workspace_premium' },
    { color: '#A5673B', bg: 'rgba(165,103,59,.15)', border: 'rgba(165,103,59,.38)', icon: 'military_tech' },
  ];

  return (
    <div className="fade-up">
      {/* Période en cours + clôture (remise à zéro non destructive) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', padding: '14px 18px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--accent-12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
          <span className="ms" style={{ fontSize: '22px', color: 'var(--accent)' }}>event_available</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' }}>Période en cours</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {periode.nom}{periode.debut ? ` · depuis le ${new Date(periode.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
        </div>
        <button onClick={() => { setErreurCloture(''); setNomPeriode(periode.nom === 'Période en cours' ? '' : periode.nom); setClotureOuverte(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '42px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 700, background: 'var(--warn-tint)', color: 'var(--warn)', border: '1px solid var(--warn-line)', whiteSpace: 'nowrap' }}>
          <span className="ms" style={{ fontSize: '18px' }}>restart_alt</span>Clôturer & remettre à 0
        </button>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(224px,1fr))', gap: '18px', marginBottom: '24px' }}>
        {STATS_CARDS.map(s => (
          <div key={s.label} style={{ padding: '22px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--accent-12)', backdropFilter: 'blur(20px)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-12)', border: '1px solid var(--accent-20)' }}>
                <span className="ms" style={{ fontSize: '23px', color: 'var(--accent)' }}>{s.icon}</span>
              </div>
              <span style={s.subStyle}>{s.sub}</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '7px' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.5px' }}>{s.value}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Ce mois-ci — comparatif vs mois précédent */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '18px', marginBottom: '24px' }}>
        {[
          { label: `Chiffre d'affaires — ${moisLabel()}`, unit: 'FCFA', courant: comparatif.caMois, precedent: comparatif.caMoisPrec },
          { label: `Ventes — ${moisLabel()}`, unit: 'ventes', courant: comparatif.nbMois, precedent: comparatif.nbMoisPrec },
          { label: `Bénéfice — ${moisLabel()}`, unit: 'FCFA', courant: marge.beneficeMois, precedent: marge.beneficeMoisPrec,
            // Le benefice ne compte que les produits dont le prix d'achat est renseigne.
            note: comparatif.caMois > 0 && marge.caCouvertMois < comparatif.caMois
              ? `Calculé sur ${Math.round((marge.caCouvertMois / comparatif.caMois) * 100)} % du CA — renseignez les prix d'achat dans Produits`
              : comparatif.caMois > 0 ? `Marge : ${Math.round((marge.beneficeMois / comparatif.caMois) * 100)} % du CA` : undefined },
        ].map((s: { label: string; unit: string; courant: number; precedent: number; note?: string }) => {
          const delta = calculerDelta(s.courant, s.precedent);
          const positif = delta !== null && delta >= 0;
          return (
            <div key={s.label} style={{ padding: '22px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--accent-12)', backdropFilter: 'blur(20px)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' }}>{s.label}</span>
                {delta !== null && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: 700, color: positif ? 'var(--success)' : 'var(--danger)', background: positif ? 'var(--success-tint)' : 'var(--danger-tint)', padding: '3px 9px', borderRadius: '20px' }}>
                    <span className="ms" style={{ fontSize: '15px' }}>{positif ? 'trending_up' : 'trending_down'}</span>{positif ? '+' : ''}{delta}%
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.5px' }}>{s.courant.toLocaleString()}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{s.unit}</span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ink-45)' }}>Mois précédent : {s.precedent.toLocaleString()} {s.unit}</div>
              {s.note && <div style={{ marginTop: '4px', fontSize: '11.5px', color: s.note.startsWith('Calculé') ? 'var(--warn)' : 'var(--success)' }}>{s.note}</div>}
            </div>
          );
        })}
      </div>

      {/* À réapprovisionner */}
      {stockBas.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '20px 24px', borderRadius: '20px', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="ms" style={{ fontSize: '22px', color: 'var(--warn)' }}>inventory_2</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>À réapprovisionner</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--surface)', border: '1px solid var(--warn-line)', padding: '2px 9px', borderRadius: '20px' }}>{stockBas.length}</span>
            </div>
            <a href="/admin/produits" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Gérer le stock</a>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {stockBas.map(p => {
              const epuise = p.stock_restant <= 0;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '12px', background: 'var(--surface)', border: `1px solid ${epuise ? 'var(--danger-line)' : 'var(--warn-line)'}` }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>{p.nom}</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: epuise ? 'var(--danger)' : 'var(--warn)', background: epuise ? 'var(--danger-tint)' : 'var(--warn-tint)', padding: '2px 8px', borderRadius: '20px' }}>{epuise ? 'Épuisé' : `${p.stock_restant} restant`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '18px' }}>
        {/* Ventes récentes */}
        <div style={{ padding: '24px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>Ventes récentes</div>
            <a href="/admin/ventes" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Tout voir</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {ventesRecentes.length === 0 ? (
              <p style={{ color: 'var(--ink-45)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Aucune vente pour le moment.</p>
            ) : ventesRecentes.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 8px', borderRadius: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '11px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-16)', flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '16px', color: 'var(--accent)', fontWeight: 600 }}>{v.clienteNom[0]}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.clienteNom}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{v.vendeuseNom}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{v.total?.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-45)' }}>FCFA</div>
                </div>
                <span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : 'Partiel'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top vendeuses */}
        <div style={{ padding: '24px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>Meilleures vendeuses</div>
            <a href="/admin/vendeuses" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Classement</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {topVendeuses.length === 0 ? (
              <p style={{ color: 'var(--ink-45)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Aucune donnée.</p>
            ) : topVendeuses.map((v, i) => {
              const m = medals[i] || medals[2];
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 8px', borderRadius: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.bg, border: `1px solid ${m.border}` }}>
                    <span className="ms" style={{ fontSize: '18px', color: m.color }}>{m.icon}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{v.nom}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{v.nb} vente{v.nb > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{v.total.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-45)' }}>FCFA</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CA par mode de paiement */}
        <div style={{ padding: '24px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>Encaissements par mode</div>
          {caParMode.length === 0 ? (
            <p style={{ color: 'var(--ink-45)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Aucun encaissement.</p>
          ) : (() => {
            const totalMode = caParMode.reduce((s, m) => s + m.total, 0) || 1;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {caParMode.map(m => {
                  const pct = Math.round((m.total / totalMode) * 100);
                  return (
                    <div key={m.mode}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>{MODE_LABELS[m.mode] || m.mode}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{m.total.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>FCFA</span> <span style={{ fontSize: '11.5px', color: 'var(--ink-45)' }}>· {pct}%</span></span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '20px', background: 'var(--surface-inset)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '20px', background: 'var(--accent)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Top produits par chiffre d'affaires */}
        <div style={{ padding: '24px', borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>{produitsMarge.length > 0 ? 'Produits les plus rentables' : "Meilleurs produits (chiffre d'affaires)"}</div>
            <a href="/admin/rapports" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Rapports</a>
          </div>
          {produitsMarge.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {produitsMarge.map((p, i) => (
                <div key={p.nom} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 8px', borderRadius: '12px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)' }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{p.quantite} vendu{p.quantite > 1 ? 's' : ''} · CA {p.ca.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: p.benefice >= 0 ? 'var(--success)' : 'var(--danger)' }}>{p.benefice >= 0 ? '+' : ''}{p.benefice.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-45)' }}>FCFA de bénéfice</div>
                  </div>
                </div>
              ))}
            </div>
          ) : produitsCa.length === 0 ? (
            <p style={{ color: 'var(--ink-45)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Aucune donnée.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {produitsCa.map((p, i) => (
                <div key={p.nom} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 8px', borderRadius: '12px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)' }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>{p.quantite} vendu{p.quantite > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{p.ca.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-45)' }}>FCFA</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de clôture */}
      {clotureOuverte && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(62,44,32,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '440px', borderRadius: '22px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '22px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)' }}>
                  <span className="ms" style={{ fontSize: '23px', color: 'var(--warn)' }}>restart_alt</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>Clôturer la période</div>
              </div>
              <p style={{ fontSize: '13.5px', lineHeight: 1.55, color: 'var(--ink-70)', margin: '0 0 8px' }}>
                Les compteurs du tableau de bord repartent à <strong>zéro</strong> pour la prochaine vente privée. <strong>Rien n'est supprimé</strong> : cette période reste consultable dans le calendrier, et les dettes clientes restent dues.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: 'var(--accent-deep)', background: 'var(--accent-08)', border: '1px solid var(--accent-20)', borderRadius: '11px', padding: '9px 12px', margin: '0 0 16px' }}>
                <span className="ms" style={{ fontSize: '17px', color: 'var(--accent)' }}>lightbulb</span>
                Pense à <a href="/admin/rapports" style={{ color: 'var(--accent-deep)', fontWeight: 700 }}>télécharger le rapport</a> avant de clôturer.
              </div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-55)', marginBottom: '6px' }}>Nom de cette période (pour le calendrier)</label>
              <input value={nomPeriode} onChange={e => setNomPeriode(e.target.value)} placeholder="Ex : Vente privée septembre" style={{ width: '100%', height: '44px', padding: '0 14px', borderRadius: '12px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px' }} />
              {erreurCloture && <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '8px' }}>{erreurCloture}</div>}
            </div>
            <div style={{ display: 'flex', gap: '10px', padding: '20px 24px 24px' }}>
              <button onClick={() => setClotureOuverte(false)} disabled={cloture} style={{ flex: 1, height: '46px', borderRadius: '13px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-55)', border: '1px solid var(--line)' }}>Annuler</button>
              <button onClick={cloturerPeriode} disabled={cloture} style={{ flex: 1, height: '46px', borderRadius: '13px', cursor: cloture ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, background: 'var(--warn)', color: '#fff', border: 'none', opacity: cloture ? 0.6 : 1 }}>{cloture ? 'Clôture…' : 'Clôturer & remettre à 0'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
