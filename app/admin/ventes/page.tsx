'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const BADGE_PAID = { fontSize: '12px', fontWeight: 700, color: '#5BBF89', background: 'rgba(91,191,137,.13)', border: '1px solid rgba(91,191,137,.25)', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' as const };
const BADGE_PART = { fontSize: '12px', fontWeight: 700, color: '#F0C040', background: 'rgba(240,192,64,.13)', border: '1px solid rgba(240,192,64,.28)', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' as const };

export default function AdminVentes() {
  const [ventes, setVentes] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => { chargerVentes(); }, []);

  const chargerVentes = async () => {
    const { data: ventesData } = await supabase.from('ventes').select('*').eq('annulee', false).order('date_vente', { ascending: false });
    if (!ventesData || ventesData.length === 0) { setVentes([]); setChargement(false); return; }
    const clienteIds = [...new Set(ventesData.map((v: any) => v.cliente_id).filter(Boolean))];
    const { data: clientes } = clienteIds.length > 0 ? await supabase.from('clientes').select('id, nom, telephone').in('id', clienteIds) : { data: [] };
    const userIds = [...new Set(ventesData.map((v: any) => v.vendeuse_id).filter(Boolean))];
    const { data: utilisateurs } = userIds.length > 0 ? await supabase.from('utilisateurs').select('id, nom').in('id', userIds) : { data: [] };
    const assembled = ventesData.map((v: any) => ({
      ...v,
      cliente: (clientes || []).find((c: any) => c.id === v.cliente_id) || null,
      vendeuse: (utilisateurs || []).find((u: any) => u.id === v.vendeuse_id) || null,
    }));
    setVentes(assembled);
    setChargement(false);
  };

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>Chargement...</div>;

  return (
    <div className="fade-up">
      {ventes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(245,245,240,.4)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'rgba(212,175,55,.3)' }}>receipt_long</span>
          Aucune vente enregistrée.
        </div>
      ) : (
        <div style={{ borderRadius: '20px', background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.1fr 1fr .9fr .8fr', gap: '16px', padding: '16px 24px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'rgba(245,245,240,.45)' }}>
            <div>Cliente</div><div>Vendeuse</div><div>Montant</div><div>Statut</div><div style={{ textAlign: 'right' }}>Date</div>
          </div>
          {ventes.map(v => (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.1fr 1fr .9fr .8fr', gap: '16px', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.04)', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg,#262420,#191815)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(212,175,55,.16)', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', color: '#D4AF37', fontWeight: 600 }}>{(v.cliente?.nom || 'I')[0]}</span>
                </div>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#F5F5F0' }}>{v.cliente?.nom || 'Inconnue'}</div>
                  {v.cliente?.telephone && <div style={{ fontSize: '11.5px', color: 'rgba(245,245,240,.4)' }}>{v.cliente.telephone}</div>}
                </div>
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(245,245,240,.7)' }}>{v.vendeuse?.nom || '—'}</div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#F5F5F0' }}>{v.total?.toLocaleString()}</span>
                <span style={{ fontSize: '11px', color: '#D4AF37', fontWeight: 600, marginLeft: '5px' }}>FCFA</span>
                {v.reste_a_payer > 0 && <div style={{ fontSize: '11.5px', color: 'rgba(240,192,64,.7)', marginTop: '2px' }}>Reste : {v.reste_a_payer?.toLocaleString()}</div>}
              </div>
              <div><span style={v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.statut_paiement === 'paye' ? 'Payé' : 'Partiel'}</span></div>
              <div style={{ textAlign: 'right', fontSize: '13.5px', color: 'rgba(245,245,240,.5)' }}>
                {new Date(v.date_vente).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
