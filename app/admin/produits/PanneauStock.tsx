'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { lireParIds } from '@/lib/requetes';

// Panneau stock d'un produit : reapprovisionner, corriger apres inventaire,
// et historique des mouvements (table mouvements_stock, alimentee par un
// trigger en base : ventes, annulations, reappros, corrections).

const TYPES: Record<string, { label: string; icone: string }> = {
  ouverture:  { label: 'Stock de départ', icone: 'flag' },
  creation:   { label: 'Création du produit', icone: 'add_box' },
  vente:      { label: 'Vente', icone: 'shopping_bag' },
  annulation: { label: 'Vente annulée', icone: 'undo' },
  reappro:    { label: 'Réapprovisionnement', icone: 'local_shipping' },
  correction: { label: 'Correction', icone: 'tune' },
};

const champ: React.CSSProperties = { height: '42px', padding: '0 12px', borderRadius: '11px', background: 'var(--surface)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px' };

type Mouvement = { id: number; type: string; quantite: number; stock_apres: number; vente_id: number | null; motif: string | null; cree_le: string; auteur: string | null };

export default function PanneauStock({ produit, onModifie }: {
  produit: { id: number; nom: string; stock_restant: number };
  onModifie: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'reappro' | 'inventaire'>('reappro');
  const [quantite, setQuantite] = useState('');
  const [note, setNote] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [mouvements, setMouvements] = useState<Mouvement[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase.from('mouvements_stock')
        .select('id, type, quantite, stock_apres, vente_id, motif, cree_le, utilisateur_id')
        .eq('produit_id', produit.id).order('cree_le', { ascending: false }).order('id', { ascending: false }).limit(50);
      if (annule) return;
      if (error) { setErreur(`Historique indisponible : ${error.message}`); setMouvements([]); return; }
      const users = await lireParIds('utilisateurs', 'id, nom', 'id', (data || []).map((m: any) => m.utilisateur_id));
      if (annule) return;
      const noms = new Map(users.map((u: any) => [u.id, u.nom]));
      setMouvements((data || []).map((m: any) => ({ ...m, auteur: noms.get(m.utilisateur_id) || null })));
    })();
    return () => { annule = true; };
  }, [produit.id, version]);

  const valider = async () => {
    const n = Number(quantite);
    setErreur(''); setSucces('');
    if (quantite.trim() === '' || !Number.isInteger(n)) { setErreur('Entrez un nombre entier.'); return; }
    if (mode === 'reappro' && n <= 0) { setErreur('La quantité reçue doit être supérieure à 0.'); return; }
    if (mode === 'inventaire' && n < 0) { setErreur('Le stock compté ne peut pas être négatif.'); return; }
    if (mode === 'inventaire' && !note.trim()) { setErreur('Indiquez le motif de la correction (ex : inventaire du jour, casse…).'); return; }
    setEnvoi(true);
    const { data, error } = mode === 'reappro'
      ? await supabase.rpc('reapprovisionner', { p_produit_id: produit.id, p_quantite: n, p_note: note.trim() })
      : await supabase.rpc('corriger_stock', { p_produit_id: produit.id, p_stock_reel: n, p_motif: note.trim() });
    setEnvoi(false);
    if (error) { setErreur(error.message); return; }
    if (mode === 'reappro') setSucces(`+${n} ajouté${n > 1 ? 's' : ''}. Stock : ${(data as any)?.stock_restant ?? '—'}.`);
    else {
      const ecart = Number((data as any)?.ecart) || 0;
      setSucces(ecart === 0 ? 'Stock confirmé, aucun écart.' : `Écart de ${ecart > 0 ? '+' : ''}${ecart} enregistré. Stock : ${n}.`);
    }
    setQuantite(''); setNote('');
    setVersion(v => v + 1);
    await onModifie();
  };

  return (
    <div style={{ flexBasis: '100%', marginTop: '4px', padding: '16px', borderRadius: '14px', background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
      {/* Mode */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {([['reappro', 'local_shipping', 'Réapprovisionner'], ['inventaire', 'fact_check', 'Inventaire / correction']] as const).map(([val, icone, label]) => (
          <button key={val} onClick={() => { setMode(val); setErreur(''); setSucces(''); setQuantite(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', borderRadius: '18px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: mode === val ? 'none' : '1px solid var(--line)', background: mode === val ? 'var(--accent)' : 'var(--surface)', color: mode === val ? 'var(--on-accent)' : 'var(--ink-70)' }}>
            <span className="ms" style={{ fontSize: '17px' }}>{icone}</span>{label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: '12.5px', color: 'var(--ink-55)', marginBottom: '8px' }}>
        {mode === 'reappro'
          ? `Stock actuel : ${produit.stock_restant}. Indiquez la quantité reçue, elle s'ajoute au stock.`
          : `Le système compte ${produit.stock_restant}. Indiquez ce que vous avez réellement compté ; l'écart est enregistré avec son motif.`}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input type="number" inputMode="numeric" min={0} value={quantite} onChange={e => setQuantite(e.target.value)} placeholder={mode === 'reappro' ? 'Quantité reçue' : 'Stock compté'} style={{ ...champ, width: '150px' }} />
        <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') valider(); }} placeholder={mode === 'reappro' ? 'Note (fournisseur, facture…) — optionnel' : 'Motif (obligatoire) : inventaire, casse, perte…'} style={{ ...champ, flex: 1, minWidth: '200px' }} />
        <button onClick={valider} disabled={envoi} style={{ height: '42px', padding: '0 18px', borderRadius: '11px', cursor: 'pointer', border: 'none', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '13.5px', fontWeight: 700, opacity: envoi ? 0.7 : 1 }}>
          {envoi ? 'Enregistrement…' : mode === 'reappro' ? 'Ajouter au stock' : 'Corriger le stock'}
        </button>
      </div>
      {erreur && <div role="alert" style={{ fontSize: '12.5px', color: 'var(--danger)', marginTop: '8px' }}>{erreur}</div>}
      {succes && <div style={{ fontSize: '12.5px', color: 'var(--success)', fontWeight: 600, marginTop: '8px' }}>{succes}</div>}

      {/* Historique */}
      <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--ink-45)', margin: '18px 0 6px' }}>Historique des mouvements</div>
      {mouvements === null ? (
        <div style={{ fontSize: '13px', color: 'var(--ink-45)' }}>Chargement…</div>
      ) : mouvements.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink-45)' }}>Aucun mouvement enregistré.</div>
      ) : (
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {mouvements.map(m => {
            const t = TYPES[m.type] || { label: m.type, icone: 'swap_vert' };
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px dashed var(--line)', fontSize: '13px' }}>
                <span className="ms" style={{ fontSize: '18px', color: 'var(--ink-45)' }}>{t.icone}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>
                    {t.label}{m.vente_id ? ` · vente n°${m.vente_id}` : ''}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-45)' }}>
                    {new Date(m.cree_le).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {m.auteur ? ` · ${m.auteur}` : ''}{m.motif && m.type !== 'ouverture' ? ` · « ${m.motif} »` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700, color: m.type === 'ouverture' ? 'var(--ink-70)' : m.quantite >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {m.type === 'ouverture' ? m.quantite : `${m.quantite > 0 ? '+' : ''}${m.quantite}`}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-45)' }}>stock {m.stock_apres}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
