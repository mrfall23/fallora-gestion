'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire, lireParIds } from '@/lib/requetes';
import { type VenteEnAttente } from '@/lib/fileHorsLigne';
import { recuDepuisVente } from '../components/RecuModal';
import { type RecuData } from '../components/Recu';

// Historique des ventes de la vendeuse connectee. La RLS ne renvoie que SES
// ventes (et leurs articles / paiements) : aucun filtre vendeuse a poser ici.

const MODE_LABELS: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };
const PAR_PAGE = 30;

type Ligne = { nom: string; quantite: number; prix: number };
type Vente = {
  id: number; date_vente: string; total: number; montant_paye: number; reste_a_payer: number; statut_paiement: string;
  annulee: boolean; clienteNom: string | null; clienteTelephone: string | null;
  lignes: Ligne[]; paiements: { id: number; montant: number; mode: string; date_paiement: string }[];
};

function debutPeriode(p: string): Date | null {
  const n = new Date();
  if (p === 'jour') return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (p === '7j') return new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6);
  if (p === 'mois') return new Date(n.getFullYear(), n.getMonth(), 1);
  return null;
}

export default function MesVentes({ isMobile, vendeuseNom, enAttente, rafraichir, onRecu }: {
  isMobile: boolean;
  vendeuseNom: string;
  enAttente: VenteEnAttente[];
  rafraichir: number;           // change apres chaque vente / synchro -> recharge
  onRecu: (r: RecuData) => void;
}) {
  const [periode, setPeriode] = useState('jour');
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [limite, setLimite] = useState(PAR_PAGE);

  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      try {
        const debut = debutPeriode(periode);
        const ventesData = await toutLire(() => {
          let q = supabase.from('ventes').select('id, date_vente, total, montant_paye, reste_a_payer, statut_paiement, annulee, cliente_id');
          if (debut) q = q.gte('date_vente', debut.toISOString());
          return q.order('date_vente', { ascending: false }).order('id', { ascending: false });
        });
        const ids = ventesData.map((v: any) => v.id);
        const [clientes, vp, paiements] = await Promise.all([
          lireParIds('clientes', 'id, nom, telephone', 'id', ventesData.map((v: any) => v.cliente_id)),
          lireParIds('vente_produits', 'id, vente_id, produit_id, quantite, prix_unitaire', 'vente_id', ids),
          lireParIds('paiements', 'id, vente_id, montant, mode, date_paiement', 'vente_id', ids),
        ]);
        const produits = await lireParIds('produits', 'id, nom', 'id', vp.map((x: any) => x.produit_id));
        if (annule) return;
        const cMap = new Map(clientes.map((c: any) => [c.id, c]));
        const pMap = new Map(produits.map((p: any) => [p.id, p.nom]));
        setVentes(ventesData.map((v: any) => ({
          ...v,
          clienteNom: cMap.get(v.cliente_id)?.nom || null,
          clienteTelephone: cMap.get(v.cliente_id)?.telephone || null,
          lignes: vp.filter((x: any) => x.vente_id === v.id).map((x: any) => ({ nom: pMap.get(x.produit_id) || 'Produit', quantite: x.quantite, prix: Number(x.prix_unitaire) || 0 })),
          paiements: paiements.filter((p: any) => p.vente_id === v.id).map((p: any) => ({ id: p.id, montant: Number(p.montant) || 0, mode: p.mode, date_paiement: p.date_paiement }))
            .sort((a: any, b: any) => a.date_paiement.localeCompare(b.date_paiement)),
        })));
        setErreur('');
      } catch (e: any) {
        if (!annule) setErreur(`Impossible de charger vos ventes : ${e?.message || 'vérifiez votre connexion'}`);
      }
      if (!annule) setChargement(false);
    })();
    return () => { annule = true; };
  }, [periode, rafraichir]);

  const actives = ventes.filter(v => !v.annulee);
  const ca = actives.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const encaisse = actives.reduce((s, v) => s + (Number(v.montant_paye) || 0), 0);
  const reste = actives.reduce((s, v) => s + (Number(v.reste_a_payer) || 0), 0);
  const avecHeure = periode === 'jour';

  return (
    <div style={{ padding: isMobile ? '18px 16px' : '28px 32px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Periode */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[['jour', "Aujourd'hui"], ['7j', '7 jours'], ['mois', 'Ce mois'], ['tout', 'Tout']].map(([val, label]) => (
          <button key={val} onClick={() => { setPeriode(val); setLimite(PAR_PAGE); setOuverte(null); }} style={{ height: '38px', padding: '0 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 600, border: periode === val ? 'none' : '1px solid var(--line)', background: periode === val ? 'var(--accent)' : 'var(--surface)', color: periode === val ? 'var(--on-accent)' : 'var(--ink-70)' }}>{label}</button>
        ))}
      </div>

      {/* Totaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          { label: 'Ventes', valeur: actives.length.toLocaleString(), unite: '' },
          { label: 'Vendu', valeur: ca.toLocaleString(), unite: 'FCFA' },
          { label: 'Encaissé', valeur: encaisse.toLocaleString(), unite: 'FCFA' },
          { label: 'Reste à encaisser', valeur: reste.toLocaleString(), unite: 'FCFA', alerte: reste > 0 },
        ].map(t => (
          <div key={t.label} style={{ padding: '12px 14px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink-45)' }}>{t.label}</div>
            <div style={{ marginTop: '3px', fontSize: '18px', fontWeight: 800, color: t.alerte ? 'var(--warn)' : 'var(--ink)' }}>
              {t.valeur} {t.unite && <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>{t.unite}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Ventes hors ligne pas encore envoyees */}
      {enAttente.length > 0 && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '14px', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>En attente d&apos;envoi (hors ligne)</div>
          {enAttente.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', padding: '4px 0', color: 'var(--ink-70)' }}>
              <span>{a.apercu.cliente} · {new Date(a.apercu.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{a.apercu.total.toLocaleString()} FCFA</span>
            </div>
          ))}
          <div style={{ fontSize: '11.5px', color: 'var(--ink-55)', marginTop: '4px' }}>Elles apparaîtront ci-dessous (avec leur reçu) une fois envoyées.</div>
        </div>
      )}

      {erreur && <div role="alert" style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '12px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px' }}>{erreur}</div>}

      {chargement ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--ink-45)' }}>Chargement…</div>
      ) : ventes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '44px', display: 'block', marginBottom: '10px', color: 'var(--accent-30)' }}>receipt_long</span>
          Aucune vente sur cette période.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ventes.slice(0, limite).map(v => {
            const d = new Date(v.date_vente);
            const ouvert = ouverte === v.id;
            return (
              <div key={v.id} style={{ borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--line)', opacity: v.annulee ? 0.6 : 1, overflow: 'hidden' }}>
                <div onClick={() => setOuverte(ouvert ? null : v.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: v.annulee ? 'line-through' : undefined }}>{v.clienteNom || 'Cliente'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-45)' }}>
                      N° {v.id} · {avecHeure ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {v.lignes.reduce((s, l) => s + l.quantite, 0)} article{v.lignes.reduce((s, l) => s + l.quantite, 0) > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{Number(v.total).toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)' }}>FCFA</span></div>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: v.annulee ? 'var(--ink-45)' : v.statut_paiement === 'paye' ? 'var(--success)' : 'var(--warn)' }}>
                      {v.annulee ? 'Annulée' : v.statut_paiement === 'paye' ? 'Payé' : `Reste ${Number(v.reste_a_payer).toLocaleString()}`}
                    </div>
                  </div>
                  <span className="ms" style={{ fontSize: '20px', color: 'var(--ink-45)' }}>{ouvert ? 'expand_less' : 'expand_more'}</span>
                </div>
                {ouvert && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--line-soft)' }}>
                    {v.lignes.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13.5px', padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
                        <span style={{ color: 'var(--ink)' }}>{l.quantite} × {l.nom}</span>
                        <span style={{ color: 'var(--ink-70)', whiteSpace: 'nowrap' }}>{(l.quantite * l.prix).toLocaleString()} FCFA</span>
                      </div>
                    ))}
                    {v.paiements.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px', paddingTop: '6px', color: 'var(--ink-55)' }}>
                        <span>Payé le {new Date(p.date_paiement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {MODE_LABELS[p.mode] || p.mode}</span>
                        <span>{p.montant.toLocaleString()} FCFA</span>
                      </div>
                    ))}
                    {!v.annulee && (
                      <button onClick={() => onRecu(recuDepuisVente({ ...v, vendeuseNom, items: v.lignes, mode: v.paiements[0]?.mode }))} style={{ marginTop: '12px', width: '100%', height: '44px', borderRadius: '12px', cursor: 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span className="ms" style={{ fontSize: '19px' }}>receipt_long</span>Renvoyer le reçu
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {ventes.length > limite && (
            <button onClick={() => setLimite(limite + PAR_PAGE)} style={{ height: '42px', borderRadius: '12px', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-70)', fontSize: '13.5px', fontWeight: 600 }}>
              Afficher plus ({ventes.length - limite})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
