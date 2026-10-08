'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SEUIL_STOCK_BAS } from '@/lib/constantes';

type Produit = { id: number; nom: string; prix: number; description: string; stock_restant: number; stock_initial: number; image: string | null; actif: boolean };
type FormProduit = { nom: string; prix: number; description: string; stock_restant: number; image: string | null; prix_achat: string };
const FORM_VIDE: FormProduit = { nom: '', prix: 0, description: '', stock_restant: 0, image: null, prix_achat: '' };

const inputStyle: React.CSSProperties = { height: '44px', padding: '0 14px', borderRadius: '12px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px', width: '100%' };

export default function AdminProduits() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [produitEdite, setProduitEdite] = useState<Produit | null>(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreur, setErreur] = useState('');
  // Prix d'achat par produit (table produits_couts, lisible par l'admin seulement).
  const [couts, setCouts] = useState<Record<number, number>>({});

  useEffect(() => { chargerProduits(); }, []);

  const chargerProduits = async () => {
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('produits').select('*').order('nom'),
      supabase.from('produits_couts').select('produit_id, prix_achat'),
    ]);
    setProduits(data || []);
    setCouts(Object.fromEntries((c || []).map((x: any) => [x.produit_id, Number(x.prix_achat)])));
    setChargement(false);
  };

  const ouvrirAjout = () => { setForm(FORM_VIDE); setProduitEdite(null); setErreur(''); setFormOuvert(true); };
  const ouvrirEdit = (p: Produit) => { setForm({ nom: p.nom, prix: p.prix, description: p.description || '', stock_restant: p.stock_restant, image: p.image, prix_achat: couts[p.id] !== undefined ? String(couts[p.id]) : '' }); setProduitEdite(p); setErreur(''); setFormOuvert(true); };
  const fermerForm = () => { setFormOuvert(false); setProduitEdite(null); };

  const sauvegarder = async () => {
    if (!form.nom.trim()) { setErreur('Le nom du produit est obligatoire.'); return; }
    if (form.prix <= 0) { setErreur('Le prix de vente doit être supérieur à 0.'); return; }
    const prixAchat = form.prix_achat.trim() === '' ? null : Number(form.prix_achat);
    if (prixAchat !== null && (isNaN(prixAchat) || prixAchat < 0)) { setErreur("Prix d'achat invalide."); return; }
    setSauvegarde(true); setErreur('');
    const champs = { nom: form.nom.trim(), prix: form.prix, description: form.description, stock_restant: form.stock_restant, image: form.image };
    let produitId = produitEdite?.id;
    if (produitEdite) {
      const diff = form.stock_restant - produitEdite.stock_restant;
      const { error } = await supabase.from('produits').update({ ...champs, stock_initial: produitEdite.stock_initial + diff }).eq('id', produitEdite.id);
      if (error) { setSauvegarde(false); setErreur(`Enregistrement impossible : ${error.message}`); return; }
    } else {
      const { data, error } = await supabase.from('produits').insert({ ...champs, stock_initial: form.stock_restant }).select('id').single();
      if (error) { setSauvegarde(false); setErreur(`Enregistrement impossible : ${error.message}`); return; }
      produitId = data.id;
    }
    // Prix d'achat : enregistre, modifie ou efface selon le champ.
    if (produitId !== undefined && prixAchat !== (couts[produitId] ?? null)) {
      const { error } = prixAchat === null
        ? await supabase.from('produits_couts').delete().eq('produit_id', produitId)
        : await supabase.from('produits_couts').upsert({ produit_id: produitId, prix_achat: prixAchat, maj_le: new Date().toISOString() });
      if (error) { setSauvegarde(false); await chargerProduits(); setErreur(`Produit enregistré, mais pas le prix d'achat : ${error.message}`); return; }
    }
    setSauvegarde(false);
    await chargerProduits();
    fermerForm();
  };

  // Retirer de la vente = masque le produit chez les vendeuses, sans rien effacer.
  const basculerActif = async (p: Produit) => {
    setErreur('');
    const { error } = await supabase.from('produits').update({ actif: !p.actif }).eq('id', p.id);
    if (error) { setErreur(`Modification impossible : ${error.message}`); return; }
    await chargerProduits();
  };

  const supprimer = async (p: Produit) => {
    if (!confirm(`Supprimer « ${p.nom} » ?`)) return;
    setErreur('');
    const { error } = await supabase.from('produits').delete().eq('id', p.id);
    // 23503 = cle etrangere : le produit figure dans des ventes (historique a conserver).
    if (error) { setErreur(error.code === '23503' ? `« ${p.nom} » a déjà été vendu : il ne peut pas être supprimé sans effacer l'historique des ventes. Utilisez plutôt « Retirer de la vente ».` : `Suppression impossible : ${error.message}`); return; }
    await chargerProduits();
  };

  const stockBadge = (p: Produit) => {
    if (p.stock_restant === 0) return { text: 'Épuisé', style: { fontSize: '12px', fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', padding: '5px 12px', borderRadius: '20px' } };
    if (p.stock_restant <= SEUIL_STOCK_BAS) return { text: `${p.stock_restant} en stock`, style: { fontSize: '12px', fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn-line)', padding: '5px 12px', borderRadius: '20px' } };
    return { text: `${p.stock_restant} en stock`, style: { fontSize: '12px', fontWeight: 700, color: 'var(--ink-70)', background: 'var(--surface-inset)', border: '1px solid var(--line)', padding: '5px 12px', borderRadius: '20px' } };
  };

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>Chargement...</div>;

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button onClick={ouvrirAjout} style={{ display: 'flex', alignItems: 'center', gap: '9px', height: '46px', padding: '0 22px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '14.5px', fontWeight: 700, boxShadow: 'var(--shadow-accent)' }}>
          <span className="ms" style={{ fontSize: '20px' }}>add</span>Ajouter un produit
        </button>
      </div>

      {erreur && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', padding: '12px 16px', borderRadius: '14px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px' }}>
          <span className="ms" style={{ fontSize: '20px' }}>error</span>
          <span style={{ flex: 1 }}>{erreur}</span>
          <button onClick={() => setErreur('')} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}><span className="ms" style={{ fontSize: '18px' }}>close</span></button>
        </div>
      )}

      {/* Formulaire */}
      {formOuvert && (
        <div style={{ marginBottom: '20px', padding: '24px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>{produitEdite ? 'Modifier le produit' : 'Nouveau produit'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>NOM DU PRODUIT *</div>
              <input style={inputStyle} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex : Sac à main cuir" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>PRIX DE VENTE (FCFA) *</div>
              <input style={inputStyle} type="number" value={form.prix || ''} onChange={e => setForm({ ...form, prix: Number(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>PRIX D&apos;ACHAT (FCFA)</div>
              <input style={inputStyle} type="number" min={0} value={form.prix_achat} onChange={e => setForm({ ...form, prix_achat: e.target.value })} placeholder="Visible par vous seul" />
              {form.prix_achat.trim() !== '' && form.prix > 0 && (
                <div style={{ fontSize: '11.5px', marginTop: '5px', color: form.prix - Number(form.prix_achat) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  Marge : {(form.prix - Number(form.prix_achat)).toLocaleString()} FCFA ({Math.round(((form.prix - Number(form.prix_achat)) / form.prix) * 100)} %)
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>STOCK *</div>
              <input style={inputStyle} type="number" value={form.stock_restant || ''} onChange={e => setForm({ ...form, stock_restant: Number(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>URL IMAGE (optionnel)</div>
              <input style={inputStyle} value={form.image || ''} onChange={e => setForm({ ...form, image: e.target.value || null })} placeholder="https://..." />
            </div>
          </div>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>DESCRIPTION</div>
            <textarea style={{ ...inputStyle, height: '72px', resize: 'vertical', paddingTop: '12px' } as any} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description optionnelle..." />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sauvegarder} disabled={sauvegarde} style={{ flex: 1, height: '46px', border: 'none', borderRadius: '13px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '14px' }}>
              {sauvegarde ? 'Sauvegarde...' : produitEdite ? 'Enregistrer les modifications' : 'Créer le produit'}
            </button>
            <button onClick={fermerForm} style={{ height: '46px', padding: '0 20px', border: '1px solid var(--line)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-55)', fontSize: '14px' }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {produits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink-45)' }}>
            <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'var(--accent-30)' }}>inventory_2</span>
            Aucun produit. Commencez par en ajouter un.
          </div>
        ) : produits.map(p => {
          const badge = stockBadge(p);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', rowGap: '12px', flexWrap: 'wrap', padding: '16px 20px', borderRadius: '18px', background: p.actif ? 'var(--surface)' : 'var(--surface-inset)', border: '1px solid var(--line)', opacity: p.actif ? 1 : 0.7 }}>
              {p.image ? (
                <img src={p.image} alt={p.nom} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '14px', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '60px', height: '60px', borderRadius: '14px', flexShrink: 0, background: 'var(--img-empty)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}>
                  <span className="ms" style={{ fontSize: '26px', color: 'var(--accent-30)' }}>image</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15.5px', fontWeight: 600, color: 'var(--ink)' }}>{p.nom}</span>
                  {!p.actif && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-55)', background: 'var(--surface)', border: '1px solid var(--line)', padding: '2px 8px', borderRadius: '20px' }}>Retiré de la vente</span>}
                </div>
                {p.description && <div style={{ fontSize: '12.5px', color: 'var(--ink-45)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
              </div>
              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>{p.prix?.toLocaleString()}</span>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginLeft: '4px' }}>FCFA</span>
                {couts[p.id] !== undefined ? (
                  <div style={{ fontSize: '11.5px', marginTop: '2px', color: p.prix - couts[p.id] >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    Marge {(p.prix - couts[p.id]).toLocaleString()} ({p.prix > 0 ? Math.round(((p.prix - couts[p.id]) / p.prix) * 100) : 0} %)
                  </div>
                ) : (
                  <div style={{ fontSize: '11.5px', marginTop: '2px', color: 'var(--ink-45)' }}>Prix d&apos;achat non renseigné</div>
                )}
              </div>
              <div style={{ minWidth: '110px', display: 'flex', justifyContent: 'center' }}>
                <span style={badge.style as any}>{badge.text}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => ouvrirEdit(p)} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: '18px' }}>edit</span>Modifier
                </button>
                <button onClick={() => basculerActif(p)} title={p.actif ? 'Masquer ce produit chez les vendeuses (historique conservé)' : 'Rendre ce produit de nouveau vendable'} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 14px', borderRadius: '12px', cursor: 'pointer', background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--ink-70)', fontSize: '13.5px', fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: '18px' }}>{p.actif ? 'visibility_off' : 'visibility'}</span>{p.actif ? 'Retirer de la vente' : 'Remettre en vente'}
                </button>
                <button onClick={() => supprimer(p)} aria-label={`Supprimer ${p.nom}`} style={{ width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
