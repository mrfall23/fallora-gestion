'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const BADGE_UP = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', padding: '3px 9px', borderRadius: '8px' } as const;
const BADGE_WARN = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', padding: '3px 9px', borderRadius: '8px' } as const;
const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)', padding: '5px 12px', borderRadius: '20px' } as const;
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '5px 12px', borderRadius: '20px' } as const;

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalVentes: 0, totalProduits: 0, stockRestant: 0, paiementsEnAttente: 0 });
  const [ventesRecentes, setVentesRecentes] = useState<any[]>([]);
  const [topVendeuses, setTopVendeuses] = useState<any[]>([]);

  useEffect(() => {
    chargerStats();
    const canal = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => chargerStats())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  // Chemin normal : une seule RPC, tout est agrege cote base.
  const chargerStats = async () => {
    const { data, error } = await supabase.rpc('tableau_de_bord_admin');
    if (error || !data) {
      // Repli : la migration 20260805120000_tableau_de_bord_admin n'est
      // peut-etre pas encore appliquee. On garde l'ancien calcul le temps du
      // deploiement — a retirer une fois la RPC en place partout.
      console.warn('RPC tableau_de_bord_admin indisponible, repli client-side.', error?.message);
      return chargerStatsFallback();
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
  };

  // Ancien calcul (repli). Rapatrie toutes les ventes dans le navigateur.
  const chargerStatsFallback = async () => {
    const { data: ventes } = await supabase.from('ventes').select('id, total, reste_a_payer, montant_paye, vendeuse_id, cliente_id, date_vente, statut_paiement').eq('annulee', false).order('date_vente', { ascending: false });
    const venteIds = (ventes || []).map((v: any) => v.id);
    const { data: venteProduits } = venteIds.length > 0 ? await supabase.from('vente_produits').select('quantite, vente_id').in('vente_id', venteIds) : { data: [] };
    const { data: produits } = await supabase.from('produits').select('stock_restant');
    const clienteIds = [...new Set((ventes || []).map((v: any) => v.cliente_id).filter(Boolean))];
    const { data: clientes } = clienteIds.length > 0 ? await supabase.from('clientes').select('id, nom').in('id', clienteIds) : { data: [] };
    const userIds = [...new Set((ventes || []).map((v: any) => v.vendeuse_id).filter(Boolean))];
    const { data: utilisateurs } = userIds.length > 0 ? await supabase.from('utilisateurs').select('id, nom').in('id', userIds) : { data: [] };

    setStats({
      totalVentes: (ventes || []).reduce((s: number, v: any) => s + v.total, 0),
      totalProduits: (venteProduits || []).reduce((s: number, vp: any) => s + vp.quantite, 0),
      stockRestant: (produits || []).reduce((s: number, p: any) => s + p.stock_restant, 0),
      paiementsEnAttente: (ventes || []).reduce((s: number, v: any) => s + v.reste_a_payer, 0),
    });

    const recentes = (ventes || []).slice(0, 5).map((v: any) => ({
      ...v,
      clienteNom: (clientes || []).find((c: any) => c.id === v.cliente_id)?.nom || 'Inconnue',
      vendeuseNom: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id)?.nom || 'Inconnue',
    }));
    setVentesRecentes(recentes);

    const vendeusesMap: any = {};
    (ventes || []).forEach((v: any) => {
      if (!v.vendeuse_id) return;
      if (!vendeusesMap[v.vendeuse_id]) vendeusesMap[v.vendeuse_id] = { total: 0, nb: 0 };
      vendeusesMap[v.vendeuse_id].total += v.total;
      vendeusesMap[v.vendeuse_id].nb += 1;
    });
    const top = Object.entries(vendeusesMap)
      .map(([id, s]: any) => ({ id: Number(id), ...s, nom: (utilisateurs || []).find((u: any) => u.id === Number(id))?.nom || 'Inconnue' }))
      .sort((a: any, b: any) => b.total - a.total)
      .slice(0, 3);
    setTopVendeuses(top);
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
      </div>
    </div>
  );
}
