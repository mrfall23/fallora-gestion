'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Produit = { id: number; nom: string; prix: number; description: string; stock_restant: number; stock_initial: number; image: string | null };
const FORM_VIDE: Omit<Produit, 'id'> = { nom: '', prix: 0, description: '', stock_restant: 0, stock_initial: 0, image: null };

const inputStyle: React.CSSProperties = { height: '44px', padding: '0 14px', borderRadius: '12px', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.1)', outline: 'none', color: '#F5F5F0', fontSize: '14px', width: '100%' };

export default function AdminProduits() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [produitEdite, setProduitEdite] = useState<Produit | null>(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [sauvegarde, setSauvegarde] = useState(false);

  useEffect(() => { chargerProduits(); }, []);

  const chargerProduits = async () => {
    const { data } = await supabase.from('produits').select('*').order('nom');
    setProduits(data || []);
    setChargement(false);
  };

  const ouvrirAjout = () => { setForm(FORM_VIDE); setProduitEdite(null); setFormOuvert(true); };
  const ouvrirEdit = (p: Produit) => { setForm({ nom: p.nom, prix: p.prix, description: p.description || '', stock_restant: p.stock_restant, stock_initial: p.stock_initial, image: p.image }); setProduitEdite(p); setFormOuvert(true); };
  const fermerForm = () => { setFormOuvert(false); setProduitEdite(null); };

  const sauvegarder = async () => {
    if (!form.nom.trim() || form.prix <= 0) return;
    setSauvegarde(true);
    if (produitEdite) {
      const diff = form.stock_restant - produitEdite.stock_restant;
      await supabase.from('produits').update({ nom: form.nom.trim(), prix: form.prix, description: form.description, stock_restant: form.stock_restant, stock_initial: produitEdite.stock_initial + diff, image: form.image }).eq('id', produitEdite.id);
    } else {
      await supabase.from('produits').insert({ nom: form.nom.trim(), prix: form.prix, description: form.description, stock_restant: form.stock_restant, stock_initial: form.stock_restant, image: form.image });
    }
    await chargerProduits();
    setSauvegarde(false);
    fermerForm();
  };

  const supprimer = async (id: number) => {
    if (!confirm('Supprimer ce produit ?')) return;
    await supabase.from('produits').delete().eq('id', id);
    await chargerProduits();
  };

  const stockBadge = (p: Produit) => {
    if (p.stock_restant === 0) return { text: 'Épuisé', style: { fontSize: '12px', fontWeight: 700, color: '#E37777', background: 'rgba(227,119,119,.12)', border: '1px solid rgba(227,119,119,.25)', padding: '5px 12px', borderRadius: '20px' } };
    if (p.stock_restant <= 5) return { text: `${p.stock_restant} en stock`, style: { fontSize: '12px', fontWeight: 700, color: '#F0C040', background: 'rgba(240,192,64,.12)', border: '1px solid rgba(240,192,64,.25)', padding: '5px 12px', borderRadius: '20px' } };
    return { text: `${p.stock_restant} en stock`, style: { fontSize: '12px', fontWeight: 700, color: 'rgba(245,245,240,.7)', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', padding: '5px 12px', borderRadius: '20px' } };
  };

  if (chargement) return <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>Chargement...</div>;

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button onClick={ouvrirAjout} style={{ display: 'flex', alignItems: 'center', gap: '9px', height: '46px', padding: '0 22px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'linear-gradient(135deg,#F0C040,#D4AF37)', color: '#0A0A0A', fontSize: '14.5px', fontWeight: 700, boxShadow: '0 10px 26px rgba(212,175,55,.25)' }}>
          <span className="ms" style={{ fontSize: '20px' }}>add</span>Ajouter un produit
        </button>
      </div>

      {/* Formulaire */}
      {formOuvert && (
        <div style={{ marginBottom: '20px', padding: '24px', borderRadius: '20px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(212,175,55,.2)', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#F5F5F0', marginBottom: '18px' }}>{produitEdite ? 'Modifier le produit' : 'Nouveau produit'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>NOM DU PRODUIT *</div>
              <input style={inputStyle} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex : Sac à main cuir" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>PRIX (FCFA) *</div>
              <input style={inputStyle} type="number" value={form.prix || ''} onChange={e => setForm({ ...form, prix: Number(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>STOCK *</div>
              <input style={inputStyle} type="number" value={form.stock_restant || ''} onChange={e => setForm({ ...form, stock_restant: Number(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>URL IMAGE (optionnel)</div>
              <input style={inputStyle} value={form.image || ''} onChange={e => setForm({ ...form, image: e.target.value || null })} placeholder="https://..." />
            </div>
          </div>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(245,245,240,.45)', letterSpacing: '.5px', marginBottom: '6px' }}>DESCRIPTION</div>
            <textarea style={{ ...inputStyle, height: '72px', resize: 'vertical', paddingTop: '12px' } as any} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description optionnelle..." />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sauvegarder} disabled={sauvegarde} style={{ flex: 1, height: '46px', border: 'none', borderRadius: '13px', cursor: 'pointer', background: 'linear-gradient(135deg,#F0C040,#D4AF37)', color: '#0A0A0A', fontWeight: 700, fontSize: '14px' }}>
              {sauvegarde ? 'Sauvegarde...' : produitEdite ? 'Enregistrer les modifications' : 'Créer le produit'}
            </button>
            <button onClick={fermerForm} style={{ height: '46px', padding: '0 20px', border: '1px solid rgba(255,255,255,.1)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'rgba(245,245,240,.6)', fontSize: '14px' }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {produits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(245,245,240,.4)' }}>
            <span className="ms" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', color: 'rgba(212,175,55,.3)' }}>inventory_2</span>
            Aucun produit. Commencez par en ajouter un.
          </div>
        ) : produits.map(p => {
          const badge = stockBadge(p);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 20px', borderRadius: '18px', background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.06)', backdropFilter: 'blur(20px)' }}>
              {p.image ? (
                <img src={p.image} alt={p.nom} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '14px', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '60px', height: '60px', borderRadius: '14px', flexShrink: 0, background: '#1a1a18', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,.07)' }}>
                  <span className="ms" style={{ fontSize: '26px', color: 'rgba(212,175,55,.4)' }}>image</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15.5px', fontWeight: 600, color: '#F5F5F0' }}>{p.nom}</div>
                {p.description && <div style={{ fontSize: '12.5px', color: 'rgba(245,245,240,.42)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
              </div>
              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <span style={{ fontSize: '17px', fontWeight: 800, color: '#F5F5F0' }}>{p.prix?.toLocaleString()}</span>
                <span style={{ fontSize: '12px', color: '#D4AF37', fontWeight: 600, marginLeft: '4px' }}>FCFA</span>
              </div>
              <div style={{ minWidth: '110px', display: 'flex', justifyContent: 'center' }}>
                <span style={badge.style as any}>{badge.text}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => ouvrirEdit(p)} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer', background: 'rgba(212,175,55,.1)', border: '1px solid rgba(212,175,55,.25)', color: '#F0C040', fontSize: '13.5px', fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: '18px' }}>edit</span>Modifier
                </button>
                <button onClick={() => supprimer(p.id)} style={{ width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', background: 'rgba(227,119,119,.1)', border: '1px solid rgba(227,119,119,.25)', color: '#E37777', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
