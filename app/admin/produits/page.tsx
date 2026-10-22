'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SEUIL_STOCK_BAS } from '@/lib/constantes';
import PanneauStock from './PanneauStock';
import { envoyerPhoto, supprimerPhoto } from '@/lib/photos';
import { nomComplet, nomDeBase, categoriesDe } from '@/lib/variantes';

type Produit = { id: number; nom: string; prix: number; description: string; stock_restant: number; stock_initial: number; image: string | null; actif: boolean; categorie: string | null; modele: string | null; taille: string | null; couleur: string | null };
type Variante = { taille: string; couleur: string; stock: number };
// nom = nom de base (modele) ; taille / couleur = variante en cours d'edition ;
// variantes = lignes a creer (creation uniquement), une par taille / couleur.
type FormProduit = { nom: string; prix: number; description: string; image: string | null; prix_achat: string; categorie: string; taille: string; couleur: string; variantes: Variante[] };
const VARIANTE_VIDE: Variante = { taille: '', couleur: '', stock: 0 };
const FORM_VIDE: FormProduit = { nom: '', prix: 0, description: '', image: null, prix_achat: '', categorie: '', taille: '', couleur: '', variantes: [VARIANTE_VIDE] };

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
  const [stockOuvert, setStockOuvert] = useState<number | null>(null);
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [varianteDe, setVarianteDe] = useState<Produit | null>(null); // article dont on ajoute une variante
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [lienManuel, setLienManuel] = useState(false);
  // Photos envoyees pendant ce formulaire : celles qui ne sont finalement pas
  // retenues (annulation, remplacement) sont supprimees du stockage.
  const photosEnvoyees = useRef<string[]>([]);

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

  const prixAchatDe = (p: Produit) => couts[p.id] !== undefined ? String(couts[p.id]) : '';
  const ouvrirAjout = () => { setForm(FORM_VIDE); setProduitEdite(null); setVarianteDe(null); setErreur(''); setFormOuvert(true); };
  // Nouvelle variante d'un article existant : memes nom de base, categorie, prix, photo.
  const ouvrirVariante = (p: Produit) => { setForm({ ...FORM_VIDE, nom: nomDeBase(p), categorie: p.categorie || '', prix: p.prix, description: p.description || '', image: p.image, prix_achat: prixAchatDe(p) }); setProduitEdite(null); setVarianteDe(p); setErreur(''); setFormOuvert(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const ouvrirEdit = (p: Produit) => { setForm({ ...FORM_VIDE, nom: nomDeBase(p), prix: p.prix, description: p.description || '', image: p.image, prix_achat: prixAchatDe(p), categorie: p.categorie || '', taille: p.taille || '', couleur: p.couleur || '', variantes: [] }); setProduitEdite(p); setVarianteDe(null); setErreur(''); setFormOuvert(true); };
  const majVariante = (i: number, champ: Partial<Variante>) => setForm(f => ({ ...f, variantes: f.variantes.map((v, j) => j === i ? { ...v, ...champ } : v) }));

  // Une photo peut etre partagee par plusieurs variantes : on ne la supprime
  // du stockage que si plus aucun produit ne l'utilise.
  const supprimerPhotoSiOrpheline = (url: string | null, saufIds: number[] = []) => {
    if (url && !produits.some(x => x.image === url && !saufIds.includes(x.id))) supprimerPhoto(url);
  };
  const fermerForm = () => { setFormOuvert(false); setProduitEdite(null); setVarianteDe(null); setLienManuel(false); photosEnvoyees.current = []; };

  const annulerForm = () => {
    photosEnvoyees.current.forEach(url => supprimerPhoto(url));
    fermerForm();
  };

  const choisirPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir la meme photo
    if (!fichier) return;
    setEnvoiPhoto(true); setErreur('');
    try {
      const url = await envoyerPhoto(fichier);
      photosEnvoyees.current.push(url);
      setForm(f => ({ ...f, image: url }));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Envoi de la photo impossible.");
    } finally {
      setEnvoiPhoto(false);
    }
  };

  const sauvegarder = async () => {
    if (!form.nom.trim()) { setErreur('Le nom du produit est obligatoire.'); return; }
    if (form.prix <= 0) { setErreur('Le prix de vente doit être supérieur à 0.'); return; }
    const prixAchat = form.prix_achat.trim() === '' ? null : Number(form.prix_achat);
    if (prixAchat !== null && (isNaN(prixAchat) || prixAchat < 0)) { setErreur("Prix d'achat invalide."); return; }
    const base = form.nom.trim();
    const variantes = form.variantes.map(v => ({ ...v, taille: v.taille.trim(), couleur: v.couleur.trim() }));
    if (!produitEdite) {
      if (variantes.length === 0) { setErreur('Ajoutez au moins une ligne de stock.'); return; }
      if (variantes.some(v => v.stock < 0)) { setErreur('Le stock ne peut pas être négatif.'); return; }
      const noms = variantes.map(v => nomComplet(base, v.taille, v.couleur).toLowerCase());
      if (new Set(noms).size !== noms.length) { setErreur('Deux lignes ont la même taille et la même couleur.'); return; }
    }
    setSauvegarde(true); setErreur('');
    const commun = { prix: form.prix, description: form.description, image: form.image, categorie: form.categorie.trim() || null };
    // modele n'est renseigne que pour les articles a variantes (taille / couleur).
    const modeleDe = (taille: string, couleur: string, avecVariantes: boolean) => avecVariantes || taille || couleur ? base : null;
    let ids: number[] = [];
    if (produitEdite) {
      // Le stock d'un produit existant ne se modifie PLUS ici : uniquement via
      // Reapprovisionner / Inventaire (panneau Stock), pour tracer chaque mouvement.
      const taille = form.taille.trim(), couleur = form.couleur.trim();
      const champs = { ...commun, nom: nomComplet(base, taille, couleur), modele: modeleDe(taille, couleur, !!produitEdite.modele), taille: taille || null, couleur: couleur || null };
      const { error } = await supabase.from('produits').update(champs).eq('id', produitEdite.id);
      if (error) { setSauvegarde(false); setErreur(`Enregistrement impossible : ${error.message}`); return; }
      ids = [produitEdite.id];
      // Nom de base modifie : les autres variantes du meme article suivent.
      if (produitEdite.modele && produitEdite.modele !== base) {
        for (const soeur of produits.filter(x => x.id !== produitEdite.id && x.modele === produitEdite.modele)) {
          await supabase.from('produits').update({ modele: base, nom: nomComplet(base, soeur.taille, soeur.couleur) }).eq('id', soeur.id);
        }
      }
    } else {
      const plusieurs = variantes.length > 1 || !!varianteDe || produits.some(x => x.modele && x.modele.trim().toLowerCase() === base.toLowerCase());
      const lignes = variantes.map(v => ({ ...commun, nom: nomComplet(base, v.taille, v.couleur), modele: modeleDe(v.taille, v.couleur, plusieurs), taille: v.taille || null, couleur: v.couleur || null, stock_restant: v.stock, stock_initial: v.stock }));
      const { data, error } = await supabase.from('produits').insert(lignes).select('id');
      if (error) { setSauvegarde(false); setErreur(`Enregistrement impossible : ${error.message}`); return; }
      ids = ((data || []) as { id: number }[]).map(d => d.id);
      // Variante ajoutee a un article simple : l'article d'origine rejoint le groupe.
      if (varianteDe && !varianteDe.modele) {
        await supabase.from('produits').update({ modele: base, nom: nomComplet(base, varianteDe.taille, varianteDe.couleur) }).eq('id', varianteDe.id);
      }
    }
    // Prix d'achat : enregistre, modifie ou efface selon le champ.
    for (const produitId of ids) {
      if (prixAchat === (couts[produitId] ?? null)) continue;
      const { error } = prixAchat === null
        ? await supabase.from('produits_couts').delete().eq('produit_id', produitId)
        : await supabase.from('produits_couts').upsert({ produit_id: produitId, prix_achat: prixAchat, maj_le: new Date().toISOString() });
      if (error) { setSauvegarde(false); await chargerProduits(); setErreur(`Produit enregistré, mais pas le prix d'achat : ${error.message}`); return; }
    }
    setSauvegarde(false);
    // Menage : photos envoyees mais non retenues, et ancienne photo remplacee.
    photosEnvoyees.current.filter(url => url !== form.image).forEach(url => supprimerPhoto(url));
    if (produitEdite?.image && produitEdite.image !== form.image) supprimerPhotoSiOrpheline(produitEdite.image, [produitEdite.id]);
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
    if (!error) supprimerPhotoSiOrpheline(p.image, [p.id]);
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
              <input style={inputStyle} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex : Robe wax" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>CATÉGORIE</div>
              <input style={inputStyle} list="categories-produits" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} placeholder="Ex : Robes, Sacs…" />
              <datalist id="categories-produits">{categoriesDe(produits).map(c => <option key={c} value={c} />)}</datalist>
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
            {produitEdite && (
              <>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>TAILLE</div>
                  <input style={inputStyle} value={form.taille} onChange={e => setForm({ ...form, taille: e.target.value })} placeholder="Ex : M, 38…" />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>COULEUR</div>
                  <input style={inputStyle} value={form.couleur} onChange={e => setForm({ ...form, couleur: e.target.value })} placeholder="Ex : Rouge" />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>STOCK</div>
                  <input style={{ ...inputStyle, color: 'var(--ink-55)' }} value={produitEdite.stock_restant} readOnly aria-readonly />
                  <div style={{ fontSize: '11.5px', marginTop: '5px', color: 'var(--ink-45)' }}>Modifiable via le bouton « Stock » (réappro / inventaire).</div>
                </div>
              </>
            )}
          </div>
          {!produitEdite && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>STOCK INITIAL * <span style={{ fontWeight: 500, letterSpacing: 0 }}>— une ligne par taille / couleur (laissez vides pour un article simple)</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {form.variantes.map((v, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 90px 40px', gap: '8px', alignItems: 'center' }}>
                    <input style={inputStyle} aria-label="Taille" placeholder="Taille (ex : M)" value={v.taille} onChange={e => majVariante(i, { taille: e.target.value })} />
                    <input style={inputStyle} aria-label="Couleur" placeholder="Couleur" value={v.couleur} onChange={e => majVariante(i, { couleur: e.target.value })} />
                    <input style={inputStyle} aria-label="Stock" type="number" min={0} placeholder="Stock" value={v.stock || ''} onChange={e => majVariante(i, { stock: Number(e.target.value) })} />
                    <button onClick={() => setForm(f => ({ ...f, variantes: f.variantes.filter((_, j) => j !== i) }))} disabled={form.variantes.length === 1} aria-label="Retirer cette ligne" style={{ width: '40px', height: '40px', borderRadius: '11px', cursor: form.variantes.length === 1 ? 'default' : 'pointer', background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink-45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: form.variantes.length === 1 ? 0.4 : 1 }}>
                      <span className="ms" style={{ fontSize: '18px' }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setForm(f => ({ ...f, variantes: [...f.variantes, VARIANTE_VIDE] }))} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-deep)', fontSize: '13px', fontWeight: 700 }}>
                <span className="ms" style={{ fontSize: '18px' }}>add</span>Ajouter une taille / couleur
              </button>
              {form.nom.trim() && form.variantes.some(v => v.taille.trim() || v.couleur.trim()) && (
                <div style={{ fontSize: '12px', color: 'var(--ink-45)', marginTop: '6px' }}>
                  Sera créé : {form.variantes.map(v => nomComplet(form.nom, v.taille, v.couleur)).join(', ')}
                </div>
              )}
            </div>
          )}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>PHOTO (optionnel)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              {form.image ? (
                <img src={form.image} alt="Aperçu" style={{ width: '88px', height: '88px', objectFit: 'cover', borderRadius: '14px', border: '1px solid var(--line)', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '88px', height: '88px', borderRadius: '14px', background: 'var(--img-empty)', border: '1px dashed var(--accent-25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="ms" style={{ fontSize: '30px', color: 'var(--accent-30)' }}>{envoiPhoto ? 'hourglass_top' : 'image'}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 16px', borderRadius: '11px', cursor: envoiPhoto ? 'default' : 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', fontSize: '13.5px', fontWeight: 700, opacity: envoiPhoto ? 0.6 : 1 }}>
                    <span className="ms" style={{ fontSize: '19px' }}>photo_camera</span>
                    {envoiPhoto ? 'Envoi…' : form.image ? 'Changer la photo' : 'Prendre / choisir une photo'}
                    <input type="file" accept="image/*" onChange={choisirPhoto} disabled={envoiPhoto} style={{ display: 'none' }} />
                  </label>
                  {form.image && !envoiPhoto && (
                    <button onClick={() => setForm({ ...form, image: null })} style={{ height: '40px', padding: '0 14px', borderRadius: '11px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink-55)', fontSize: '13px', fontWeight: 600 }}>Retirer</button>
                  )}
                </div>
                {lienManuel ? (
                  <input style={{ ...inputStyle, height: '38px', fontSize: '13px' }} value={form.image || ''} onChange={e => setForm({ ...form, image: e.target.value || null })} placeholder="https://..." aria-label="Lien de l'image" />
                ) : (
                  <button onClick={() => setLienManuel(true)} style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-45)', fontSize: '12px', textDecoration: 'underline' }}>ou coller un lien d&apos;image</button>
                )}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' }}>DESCRIPTION</div>
            <textarea style={{ ...inputStyle, height: '72px', resize: 'vertical', paddingTop: '12px' } as any} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description optionnelle..." />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sauvegarder} disabled={sauvegarde || envoiPhoto} style={{ flex: 1, height: '46px', border: 'none', borderRadius: '13px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '14px' }}>
              {sauvegarde ? 'Sauvegarde...' : produitEdite ? 'Enregistrer les modifications' : form.variantes.length > 1 ? `Créer les ${form.variantes.length} variantes` : 'Créer le produit'}
            </button>
            <button onClick={annulerForm} style={{ height: '46px', padding: '0 20px', border: '1px solid var(--line)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-55)', fontSize: '14px' }}>Annuler</button>
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
        ) : (() => {
          const categories = categoriesDe(produits);
          const visibles = produits
            .filter(p => !filtreCategorie || (filtreCategorie === '—' ? !p.categorie : p.categorie === filtreCategorie))
            .sort((a, b) => Number(!a.categorie) - Number(!b.categorie) || (a.categorie || '').localeCompare(b.categorie || '', 'fr') || nomDeBase(a).localeCompare(nomDeBase(b), 'fr') || a.nom.localeCompare(b.nom, 'fr'));
          return (<>
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {[['', 'Toutes'], ...categories.map(c => [c, c]), ...(produits.some(p => !p.categorie) ? [['—', 'Sans catégorie']] : [])].map(([val, label]) => (
                <button key={val} onClick={() => setFiltreCategorie(val)} style={{ height: '34px', padding: '0 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: filtreCategorie === val ? 'none' : '1px solid var(--line)', background: filtreCategorie === val ? 'var(--accent)' : 'var(--surface)', color: filtreCategorie === val ? 'var(--on-accent)' : 'var(--ink-70)' }}>{label}</button>
              ))}
            </div>
          )}
          {visibles.map(p => {
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
                  {p.categorie && <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-deep)', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', padding: '2px 8px', borderRadius: '20px' }}>{p.categorie}</span>}
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
                <button onClick={() => ouvrirVariante(p)} title="Ajouter une autre taille / couleur de cet article" style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px', padding: '0 14px', borderRadius: '12px', cursor: 'pointer', background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--ink-70)', fontSize: '13.5px', fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: '18px' }}>add</span>Variante
                </button>
                <button onClick={() => setStockOuvert(stockOuvert === p.id ? null : p.id)} aria-expanded={stockOuvert === p.id} title="Réapprovisionner, faire l'inventaire, voir l'historique" style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 14px', borderRadius: '12px', cursor: 'pointer', background: stockOuvert === p.id ? 'var(--accent)' : 'var(--surface-inset)', border: '1px solid var(--line)', color: stockOuvert === p.id ? 'var(--on-accent)' : 'var(--ink-70)', fontSize: '13.5px', fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: '18px' }}>inventory</span>Stock
                </button>
                <button onClick={() => basculerActif(p)} title={p.actif ? 'Masquer ce produit chez les vendeuses (historique conservé)' : 'Rendre ce produit de nouveau vendable'} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 14px', borderRadius: '12px', cursor: 'pointer', background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--ink-70)', fontSize: '13.5px', fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: '18px' }}>{p.actif ? 'visibility_off' : 'visibility'}</span>{p.actif ? 'Retirer de la vente' : 'Remettre en vente'}
                </button>
                <button onClick={() => supprimer(p)} aria-label={`Supprimer ${p.nom}`} style={{ width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
              {stockOuvert === p.id && <PanneauStock produit={p} onModifie={chargerProduits} />}
            </div>
          );
        })}
          </>);
        })()}
      </div>
    </div>
  );
}
