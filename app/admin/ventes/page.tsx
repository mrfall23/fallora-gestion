'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire, lireParIds } from '@/lib/requetes';
import RecuModal, { recuDepuisVente } from '../../components/RecuModal';
import { type RecuData } from '../../components/Recu';

const BADGE = { fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap' as const };
const BADGE_PAID = { ...BADGE, color: 'var(--success)', background: 'var(--success-tint)', border: '1px solid var(--success-line)' };
const BADGE_PART = { ...BADGE, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)' };
const BADGE_ANNUL = { ...BADGE, color: 'var(--ink-55)', background: 'var(--surface-inset)', border: '1px solid var(--line)' };

const MODE_LABELS: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };
const GRILLE = '1.5fr 1.1fr 1fr .9fr .8fr 84px';
const PAR_PAGE = 50;

const champ: React.CSSProperties = { height: '42px', padding: '0 12px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '13.5px' };

type Ligne = { nom: string; quantite: number; prix: number };
type Paiement = { id: number; montant: number; mode: string; date_paiement: string };
type Vente = {
  id: number; date_vente: string; total: number; montant_paye: number; reste_a_payer: number; statut_paiement: string;
  annulee: boolean; annulee_le: string | null; motif_annulation: string | null; vendeuse_id: number | null;
  clienteNom: string | null; clienteTelephone: string | null; vendeuseNom: string | null;
  lignes: Ligne[]; paiements: Paiement[];
};

// Bornes de periode en heure locale (= heure du Cameroun sur les appareils de la boutique).
function debutPeriode(p: string): Date | null {
  const n = new Date();
  if (p === 'jour') return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (p === '7j') return new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6);
  if (p === 'mois') return new Date(n.getFullYear(), n.getMonth(), 1);
  if (p === 'mois_prec') return new Date(n.getFullYear(), n.getMonth() - 1, 1);
  return null;
}
function finPeriode(p: string): Date | null {
  const n = new Date();
  return p === 'mois_prec' ? new Date(n.getFullYear(), n.getMonth(), 1) : null;
}

export default function AdminVentes() {
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  // Filtres
  const [recherche, setRecherche] = useState('');
  const [periode, setPeriode] = useState('tout');
  const [vendeuse, setVendeuse] = useState('toutes');
  const [statut, setStatut] = useState('actives');
  const [limite, setLimite] = useState(PAR_PAGE);
  // Detail / actions
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [recu, setRecu] = useState<RecuData | null>(null);
  const [venteAAnnuler, setVenteAAnnuler] = useState<number | null>(null);
  const [motif, setMotif] = useState('');
  const [erreurAnnul, setErreurAnnul] = useState('');
  const [annulation, setAnnulation] = useState(false);

  useEffect(() => { chargerVentes(); }, []);

  const chargerVentes = async () => {
    try {
      const ventesData = await toutLire(() => supabase.from('ventes').select('*').order('date_vente', { ascending: false }).order('id', { ascending: false }));
      const venteIds = ventesData.map((v: any) => v.id);
      const [clientes, utilisateurs, vp, paiements] = await Promise.all([
        lireParIds('clientes', 'id, nom, telephone', 'id', ventesData.map((v: any) => v.cliente_id)),
        lireParIds('utilisateurs', 'id, nom', 'id', ventesData.map((v: any) => v.vendeuse_id)),
        lireParIds('vente_produits', 'id, vente_id, produit_id, quantite, prix_unitaire', 'vente_id', venteIds),
        lireParIds('paiements', 'id, vente_id, montant, mode, date_paiement', 'vente_id', venteIds),
      ]);
      const produits = await lireParIds('produits', 'id, nom', 'id', vp.map((x: any) => x.produit_id));
      const parId = <T extends { id: number }>(l: T[]) => new Map(l.map(x => [x.id, x]));
      const cMap = parId(clientes as any[]), uMap = parId(utilisateurs as any[]), pMap = parId(produits as any[]);
      const lignesPar = new Map<number, Ligne[]>(), paiementsPar = new Map<number, Paiement[]>();
      for (const x of vp as any[]) {
        const l = lignesPar.get(x.vente_id) || [];
        l.push({ nom: pMap.get(x.produit_id)?.nom || 'Produit supprimé', quantite: x.quantite, prix: Number(x.prix_unitaire) || 0 });
        lignesPar.set(x.vente_id, l);
      }
      for (const p of paiements as any[]) {
        const l = paiementsPar.get(p.vente_id) || [];
        l.push({ id: p.id, montant: Number(p.montant) || 0, mode: p.mode, date_paiement: p.date_paiement });
        paiementsPar.set(p.vente_id, l);
      }
      setVentes(ventesData.map((v: any) => ({
        ...v,
        clienteNom: cMap.get(v.cliente_id)?.nom || null,
        clienteTelephone: cMap.get(v.cliente_id)?.telephone || null,
        vendeuseNom: uMap.get(v.vendeuse_id)?.nom || null,
        lignes: lignesPar.get(v.id) || [],
        paiements: (paiementsPar.get(v.id) || []).sort((a, b) => a.date_paiement.localeCompare(b.date_paiement)),
      })));
      setErreurChargement('');
    } catch (e: any) {
      setErreurChargement(`Impossible de charger les ventes : ${e?.message || 'erreur réseau'}`);
    }
    setChargement(false);
  };

  const vendeuses = useMemo(() => {
    const m = new Map<number, string>();
    for (const v of ventes) if (v.vendeuse_id && v.vendeuseNom) m.set(v.vendeuse_id, v.vendeuseNom);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [ventes]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase().replace(/^n°\s*/, '');
    const debut = debutPeriode(periode), fin = finPeriode(periode);
    return ventes.filter(v => {
      if (statut === 'actives' && v.annulee) return false;
      if (statut === 'annulees' && !v.annulee) return false;
      if ((statut === 'paye' || statut === 'partiel') && (v.annulee || v.statut_paiement !== statut)) return false;
      if (vendeuse !== 'toutes' && String(v.vendeuse_id) !== vendeuse) return false;
      const d = new Date(v.date_vente);
      if (debut && d < debut) return false;
      if (fin && d >= fin) return false;
      if (q) {
        const texte = [v.clienteNom, v.clienteTelephone, v.vendeuseNom, String(v.id), ...v.lignes.map(l => l.nom)].filter(Boolean).join(' ').toLowerCase();
        if (!texte.includes(q)) return false;
      }
      return true;
    });
  }, [ventes, recherche, periode, vendeuse, statut]);

  const totaux = useMemo(() => {
    const actives = filtrees.filter(v => !v.annulee);
    return {
      nb: filtrees.length,
      ca: actives.reduce((s, v) => s + (Number(v.total) || 0), 0),
      encaisse: actives.reduce((s, v) => s + (Number(v.montant_paye) || 0), 0),
      reste: actives.reduce((s, v) => s + (Number(v.reste_a_payer) || 0), 0),
    };
  }, [filtrees]);

  const ouvrirRecu = (v: Vente) => setRecu(recuDepuisVente({
    ...v, items: v.lignes, mode: v.paiements[0]?.mode,
  }));

  // Annulation (admin) : archive la vente et remet le stock en rayon.
  const ouvrirAnnulation = (id: number) => { setVenteAAnnuler(id); setMotif(''); setErreurAnnul(''); };

  const confirmerAnnulation = async (id: number) => {
    if (!motif.trim()) { setErreurAnnul("Indiquez le motif de l'annulation."); return; }
    setAnnulation(true); setErreurAnnul('');
    const { error } = await supabase.rpc('annuler_vente', { p_vente_id: id, p_motif: motif.trim() });
    setAnnulation(false);
    if (error) { setErreurAnnul(error.message || "Échec de l'annulation."); return; }
    setVenteAAnnuler(null);
    await chargerVentes();
  };

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>;

  const visibles = filtrees.slice(0, limite);
  const filtreActif = recherche || periode !== 'tout' || vendeuse !== 'toutes' || statut !== 'actives';

  return (
    <div className="fade-up">
      {erreurChargement && (
        <div role="alert" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '14px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px' }}>{erreurChargement}</div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <span className="ms" style={{ position: 'absolute', left: '12px', top: '11px', fontSize: '20px', color: 'var(--ink-45)' }}>search</span>
          <input value={recherche} onChange={e => { setRecherche(e.target.value); setLimite(PAR_PAGE); }} placeholder="Cliente, téléphone, produit, n° de vente…" style={{ ...champ, width: '100%', paddingLeft: '40px' }} />
        </div>
        <select value={periode} onChange={e => { setPeriode(e.target.value); setLimite(PAR_PAGE); }} style={champ} aria-label="Période">
          <option value="tout">Toutes les dates</option>
          <option value="jour">Aujourd&apos;hui</option>
          <option value="7j">7 derniers jours</option>
          <option value="mois">Ce mois-ci</option>
          <option value="mois_prec">Mois dernier</option>
        </select>
        <select value={vendeuse} onChange={e => { setVendeuse(e.target.value); setLimite(PAR_PAGE); }} style={champ} aria-label="Vendeuse">
          <option value="toutes">Toutes les vendeuses</option>
          {vendeuses.map(([id, nom]) => <option key={id} value={String(id)}>{nom}</option>)}
        </select>
        <select value={statut} onChange={e => { setStatut(e.target.value); setLimite(PAR_PAGE); }} style={champ} aria-label="Statut">
          <option value="actives">Toutes (hors annulées)</option>
          <option value="paye">Payées</option>
          <option value="partiel">Reste à payer</option>
          <option value="annulees">Annulées</option>
        </select>
        {filtreActif && (
          <button onClick={() => { setRecherche(''); setPeriode('tout'); setVendeuse('toutes'); setStatut('actives'); setLimite(PAR_PAGE); }} style={{ ...champ, cursor: 'pointer', color: 'var(--ink-55)', fontWeight: 600 }}>Réinitialiser</button>
        )}
      </div>

      {/* Totaux de la selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Ventes', valeur: totaux.nb.toLocaleString(), unite: '' },
          { label: "Chiffre d'affaires", valeur: totaux.ca.toLocaleString(), unite: 'FCFA' },
          { label: 'Encaissé', valeur: totaux.encaisse.toLocaleString(), unite: 'FCFA' },
          { label: 'Reste à encaisser', valeur: totaux.reste.toLocaleString(), unite: 'FCFA', alerte: totaux.reste > 0 },
        ].map(t => (
          <div key={t.label} style={{ padding: '14px 16px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink-45)' }}>{t.label}</div>
            <div style={{ marginTop: '4px', fontSize: '20px', fontWeight: 800, color: t.alerte ? 'var(--warn)' : 'var(--ink)' }}>
              {t.valeur} {t.unite && <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>{t.unite}</span>}
            </div>
          </div>
        ))}
      </div>

      {filtrees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>receipt_long</span>
          {ventes.length === 0 ? 'Aucune vente enregistrée.' : 'Aucune vente ne correspond à ces filtres.'}
        </div>
      ) : (
        <div style={{ borderRadius: '20px', background: 'var(--surface)', border: '1px solid var(--line)', overflow: 'hidden' }}>
         <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRILLE, gap: '16px', padding: '16px 24px', background: 'var(--surface-inset)', borderBottom: '1px solid var(--line)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--ink-45)', minWidth: '720px' }}>
            <div>Cliente</div><div>Vendeuse</div><div>Montant</div><div>Statut</div><div style={{ textAlign: 'right' }}>Date</div><div />
          </div>
          {visibles.map(v => (
           <div key={v.id}>
            <div onClick={() => setOuverte(ouverte === v.id ? null : v.id)} style={{ display: 'grid', gridTemplateColumns: GRILLE, gap: '16px', padding: '16px 24px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center', minWidth: '720px', cursor: 'pointer', opacity: v.annulee ? 0.65 : 1, background: ouverte === v.id ? 'var(--surface-inset)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-16)', flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '15px', color: 'var(--accent)', fontWeight: 600 }}>{(v.clienteNom || 'I')[0]}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)', textDecoration: v.annulee ? 'line-through' : undefined }}>{v.clienteNom || 'Inconnue'}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-45)' }}>N° {v.id}{v.clienteTelephone ? ` · ${v.clienteTelephone}` : ''}</div>
                </div>
              </div>
              <div style={{ fontSize: '14px', color: 'var(--ink-70)' }}>{v.vendeuseNom || '—'}</div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{Number(v.total).toLocaleString()}</span>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginLeft: '5px' }}>FCFA</span>
                {!v.annulee && v.reste_a_payer > 0 && <div style={{ fontSize: '11.5px', color: 'var(--warn)', marginTop: '2px' }}>Reste : {Number(v.reste_a_payer).toLocaleString()}</div>}
              </div>
              <div><span style={v.annulee ? BADGE_ANNUL : v.statut_paiement === 'paye' ? BADGE_PAID : BADGE_PART}>{v.annulee ? 'Annulée' : v.statut_paiement === 'paye' ? 'Payé' : 'Partiel'}</span></div>
              <div style={{ textAlign: 'right', fontSize: '13.5px', color: 'var(--ink-55)' }}>
                {new Date(v.date_vente).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: new Date(v.date_vente).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                {!v.annulee && (
                  <>
                    <button onClick={() => ouvrirRecu(v)} aria-label={`Reçu de la vente n°${v.id}`} title="Voir / renvoyer le reçu" style={{ width: '38px', height: '38px', borderRadius: '11px', cursor: 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="ms" style={{ fontSize: '18px' }}>receipt_long</span>
                    </button>
                    <button onClick={() => venteAAnnuler === v.id ? setVenteAAnnuler(null) : ouvrirAnnulation(v.id)} aria-label={`Annuler la vente n°${v.id}`} title="Annuler cette vente" style={{ width: '38px', height: '38px', borderRadius: '11px', cursor: 'pointer', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="ms" style={{ fontSize: '18px' }}>block</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Detail deplie */}
            {ouverte === v.id && (
              <div style={{ padding: '16px 24px 20px', borderBottom: '1px solid var(--line)', background: 'var(--surface-inset)', minWidth: '720px', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-45)', marginBottom: '8px' }}>Articles</div>
                  {v.lignes.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink-45)' }}>—</div> : v.lignes.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13.5px', padding: '5px 0', borderBottom: '1px dashed var(--line)' }}>
                      <span style={{ color: 'var(--ink)' }}>{l.quantite} × {l.nom}</span>
                      <span style={{ color: 'var(--ink-70)', whiteSpace: 'nowrap' }}>{(l.quantite * l.prix).toLocaleString()} FCFA</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, paddingTop: '8px', color: 'var(--ink)' }}>
                    <span>Total</span><span>{Number(v.total).toLocaleString()} FCFA</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-45)', marginTop: '6px' }}>
                    {new Date(v.date_vente).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-45)', marginBottom: '8px' }}>Paiements</div>
                  {v.paiements.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink-45)' }}>Aucun paiement.</div> : v.paiements.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13.5px', padding: '5px 0', borderBottom: '1px dashed var(--line)' }}>
                      <span style={{ color: 'var(--ink-70)' }}>{new Date(p.date_paiement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {MODE_LABELS[p.mode] || p.mode}</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.montant.toLocaleString()} FCFA</span>
                    </div>
                  ))}
                  {!v.annulee && v.reste_a_payer > 0 && (
                    <div style={{ fontSize: '13px', color: 'var(--warn)', fontWeight: 600, paddingTop: '8px' }}>
                      Reste dû : {Number(v.reste_a_payer).toLocaleString()} FCFA · <a href="/admin/clients" style={{ color: 'var(--accent)' }}>encaisser depuis Clientes</a>
                    </div>
                  )}
                  {v.annulee && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--line)', fontSize: '13px', color: 'var(--ink-70)' }}>
                      <strong>Annulée</strong>{v.annulee_le ? ` le ${new Date(v.annulee_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}
                      {v.motif_annulation && <div style={{ marginTop: '3px' }}>Motif : {v.motif_annulation}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {venteAAnnuler === v.id && (
              <div style={{ padding: '16px 24px', background: 'var(--danger-tint)', borderBottom: '1px solid var(--danger-line)', minWidth: '720px' }}>
                <div style={{ fontSize: '13.5px', color: 'var(--ink)', marginBottom: '10px' }}>
                  Annuler la vente n°{v.id} ({Number(v.total).toLocaleString()} FCFA) ? Les articles seront <strong>remis en stock</strong> et la vente sortira des statistiques. Elle reste archivée.
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input autoFocus value={motif} onChange={e => setMotif(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmerAnnulation(v.id); }} placeholder="Motif (ex : erreur de saisie, retour client…)" style={{ flex: 1, minWidth: '220px', height: '40px', padding: '0 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px' }} />
                  <button onClick={() => confirmerAnnulation(v.id)} disabled={annulation} style={{ height: '40px', padding: '0 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: 'var(--danger)', color: '#fff', border: 'none' }}>{annulation ? 'Annulation…' : "Confirmer l'annulation"}</button>
                  <button onClick={() => setVenteAAnnuler(null)} disabled={annulation} style={{ height: '40px', padding: '0 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-55)', border: '1px solid var(--line)' }}>Retour</button>
                </div>
                {erreurAnnul && <div style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '8px' }}>{erreurAnnul}</div>}
              </div>
            )}
           </div>
          ))}
         </div>
         {filtrees.length > limite && (
           <div style={{ padding: '14px', textAlign: 'center', borderTop: '1px solid var(--line-soft)' }}>
             <button onClick={() => setLimite(limite + PAR_PAGE)} style={{ height: '40px', padding: '0 18px', borderRadius: '12px', cursor: 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600 }}>
               Afficher plus ({filtrees.length - limite} restante{filtrees.length - limite > 1 ? 's' : ''})
             </button>
           </div>
         )}
        </div>
      )}

      {recu && <RecuModal data={recu} onClose={() => setRecu(null)} />}
    </div>
  );
}
