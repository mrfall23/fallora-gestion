'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toutLire } from '@/lib/requetes';

// Depenses et charges de la boutique (admin uniquement, RLS). Elles sont
// deduites du benefice des ventes sur le tableau de bord (benefice net).

type Depense = { id: number; date_depense: string; categorie: string; libelle: string | null; montant: number };
type FormDepense = { date_depense: string; categorie: string; libelle: string; montant: number | '' };

const CATEGORIES_PROPOSEES = ['Transport', 'Loyer', 'Commissions', 'Salaires', 'Emballage', 'Publicité', 'Électricité / eau', 'Téléphone / internet', 'Autre'];

const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const FORM_VIDE = (): FormDepense => ({ date_depense: aujourdhui(), categorie: '', libelle: '', montant: '' });

const inputStyle: React.CSSProperties = { height: '44px', padding: '0 14px', borderRadius: '12px', background: 'var(--surface-inset)', border: '1px solid var(--line)', outline: 'none', color: 'var(--ink)', fontSize: '14px', width: '100%' };
const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--ink-45)', letterSpacing: '.5px', marginBottom: '6px' };

// « 2026-10 » -> bornes [1er du mois, 1er du mois suivant) au format date.
function bornesMois(mois: string): [string, string] {
  const [a, m] = mois.split('-').map(Number);
  const suivant = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return [`${mois}-01`, `${suivant}-01`];
}
function decalerMois(mois: string, delta: number): string {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminDepenses() {
  const [mois, setMois] = useState(() => aujourdhui().slice(0, 7));
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [totalMoisPrec, setTotalMoisPrec] = useState(0);
  const [categoriesConnues, setCategoriesConnues] = useState<string[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [editee, setEditee] = useState<Depense | null>(null);
  const [form, setForm] = useState<FormDepense>(FORM_VIDE);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => { charger(mois); }, [mois]);

  const charger = async (m: string) => {
    setChargement(true);
    try {
      const [debut, fin] = bornesMois(m);
      const [debutPrec] = bornesMois(decalerMois(m, -1));
      const [data, prec, cats] = await Promise.all([
        toutLire<Depense>(() => supabase.from('depenses').select('id, date_depense, categorie, libelle, montant').gte('date_depense', debut).lt('date_depense', fin).order('date_depense', { ascending: false }).order('id', { ascending: false })),
        toutLire<{ montant: number }>(() => supabase.from('depenses').select('montant').gte('date_depense', debutPrec).lt('date_depense', debut).order('id')),
        toutLire<{ categorie: string }>(() => supabase.from('depenses').select('categorie').order('id')),
      ]);
      setDepenses(data.map(d => ({ ...d, montant: Number(d.montant) || 0 })));
      setTotalMoisPrec(prec.reduce((s, d) => s + (Number(d.montant) || 0), 0));
      setCategoriesConnues([...new Set([...CATEGORIES_PROPOSEES, ...cats.map(c => c.categorie)])]);
      setErreur('');
    } catch (e) {
      setErreur(`Chargement impossible : ${e instanceof Error ? e.message : 'vérifiez votre connexion'}`);
    }
    setChargement(false);
  };

  const ouvrirAjout = () => { setForm(FORM_VIDE()); setEditee(null); setErreur(''); setFormOuvert(true); };
  const ouvrirEdit = (d: Depense) => { setForm({ date_depense: d.date_depense, categorie: d.categorie, libelle: d.libelle || '', montant: d.montant }); setEditee(d); setErreur(''); setFormOuvert(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const sauvegarder = async () => {
    const montant = Number(form.montant);
    if (!form.categorie.trim()) { setErreur('Choisissez une catégorie.'); return; }
    if (!montant || montant <= 0) { setErreur('Entrez un montant supérieur à 0.'); return; }
    if (!form.date_depense) { setErreur('Entrez la date.'); return; }
    setSauvegarde(true); setErreur('');
    const champs = { date_depense: form.date_depense, categorie: form.categorie.trim(), libelle: form.libelle.trim() || null, montant };
    const { error } = editee
      ? await supabase.from('depenses').update(champs).eq('id', editee.id)
      : await supabase.from('depenses').insert(champs);
    setSauvegarde(false);
    if (error) { setErreur(`Enregistrement impossible : ${error.message}`); return; }
    setFormOuvert(false); setEditee(null);
    // Affiche le mois de la depense saisie.
    const moisDepense = form.date_depense.slice(0, 7);
    if (moisDepense !== mois) setMois(moisDepense); else await charger(mois);
  };

  const supprimer = async (d: Depense) => {
    if (!confirm(`Supprimer la dépense « ${d.libelle || d.categorie} » de ${d.montant.toLocaleString()} FCFA ?`)) return;
    const { error } = await supabase.from('depenses').delete().eq('id', d.id);
    if (error) { setErreur(`Suppression impossible : ${error.message}`); return; }
    await charger(mois);
  };

  const total = depenses.reduce((s, d) => s + d.montant, 0);
  const parCategorie = Object.entries(depenses.reduce<Record<string, number>>((acc, d) => { acc[d.categorie] = (acc[d.categorie] || 0) + d.montant; return acc; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const libelleMois = new Date(`${mois}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const moisCourant = mois === aujourdhui().slice(0, 7);

  return (
    <div className="fade-up">
      {/* Navigation par mois + ajout */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent" style={{ width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-70)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="ms" style={{ fontSize: '20px' }}>chevron_left</span>
          </button>
          <span style={{ minWidth: '150px', textAlign: 'center', fontSize: '16px', fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>{libelleMois}</span>
          <button onClick={() => setMois(decalerMois(mois, 1))} disabled={moisCourant} aria-label="Mois suivant" style={{ width: '40px', height: '40px', borderRadius: '12px', cursor: moisCourant ? 'default' : 'pointer', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-70)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: moisCourant ? 0.4 : 1 }}>
            <span className="ms" style={{ fontSize: '20px' }}>chevron_right</span>
          </button>
        </div>
        <button onClick={ouvrirAjout} style={{ display: 'flex', alignItems: 'center', gap: '9px', height: '46px', padding: '0 22px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '14.5px', fontWeight: 700, boxShadow: 'var(--shadow-accent)' }}>
          <span className="ms" style={{ fontSize: '20px' }}>add</span>Ajouter une dépense
        </button>
      </div>

      {erreur && (
        <div role="alert" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '14px', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', fontSize: '13.5px' }}>{erreur}</div>
      )}

      {/* Formulaire */}
      {formOuvert && (
        <div style={{ marginBottom: '20px', padding: '24px', borderRadius: '20px', background: 'var(--surface-2)', border: '1px solid var(--accent-20)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>{editee ? 'Modifier la dépense' : 'Nouvelle dépense'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={labelStyle}>DATE *</div>
              <input type="date" style={inputStyle} value={form.date_depense} max={aujourdhui()} onChange={e => setForm({ ...form, date_depense: e.target.value })} />
            </div>
            <div>
              <div style={labelStyle}>CATÉGORIE *</div>
              <input style={inputStyle} list="categories-depenses" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} placeholder="Ex : Transport" />
              <datalist id="categories-depenses">{categoriesConnues.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <div style={labelStyle}>MONTANT (FCFA) *</div>
              <input type="number" min={1} inputMode="numeric" style={inputStyle} value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={labelStyle}>DÉTAIL</div>
              <input style={inputStyle} value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} placeholder="Ex : taxi marché Mokolo" onKeyDown={e => e.key === 'Enter' && sauvegarder()} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sauvegarder} disabled={sauvegarde} style={{ flex: 1, height: '46px', border: 'none', borderRadius: '13px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontWeight: 700, fontSize: '14px', opacity: sauvegarde ? 0.7 : 1 }}>
              {sauvegarde ? 'Sauvegarde...' : editee ? 'Enregistrer les modifications' : 'Ajouter la dépense'}
            </button>
            <button onClick={() => { setFormOuvert(false); setEditee(null); }} style={{ height: '46px', padding: '0 20px', border: '1px solid var(--line)', borderRadius: '13px', cursor: 'pointer', background: 'transparent', color: 'var(--ink-55)', fontSize: '14px' }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Totaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ padding: '20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase' }}>Total du mois</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--danger)', marginTop: '4px' }}>{total.toLocaleString()} <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>FCFA</span></div>
          <div style={{ fontSize: '12px', color: 'var(--ink-45)', marginTop: '2px' }}>Mois précédent : {totalMoisPrec.toLocaleString()} FCFA</div>
        </div>
        {parCategorie.length > 0 && (
          <div style={{ padding: '16px 20px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--accent-12)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', color: 'var(--ink-55)', textTransform: 'uppercase', marginBottom: '8px' }}>Par catégorie</div>
            {parCategorie.map(([cat, montant]) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', padding: '3px 0' }}>
                <span style={{ color: 'var(--ink-70)' }}>{cat}</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{montant.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--ink-45)' }}>({total > 0 ? Math.round((montant / total) * 100) : 0} %)</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Liste */}
      {chargement ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--ink-45)' }}>Chargement...</div>
      ) : depenses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--ink-45)' }}>
          <span className="ms" style={{ fontSize: '44px', display: 'block', marginBottom: '10px', color: 'var(--accent-30)' }}>payments</span>
          Aucune dépense en {libelleMois}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {depenses.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <div style={{ width: '54px', textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{new Date(`${d.date_depense}T12:00:00`).getDate()}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink-45)', textTransform: 'uppercase' }}>{new Date(`${d.date_depense}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--accent-deep)', background: 'var(--accent-12)', border: '1px solid var(--accent-20)', padding: '2px 9px', borderRadius: '20px' }}>{d.categorie}</span>
                {d.libelle && <div style={{ fontSize: '13.5px', color: 'var(--ink)', marginTop: '4px' }}>{d.libelle}</div>}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>−{d.montant.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>FCFA</span></div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => ouvrirEdit(d)} aria-label="Modifier la dépense" style={{ width: '38px', height: '38px', borderRadius: '11px', cursor: 'pointer', background: 'var(--accent-12)', border: '1px solid var(--accent-25)', color: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>edit</span>
                </button>
                <button onClick={() => supprimer(d)} aria-label="Supprimer la dépense" style={{ width: '38px', height: '38px', borderRadius: '11px', cursor: 'pointer', background: 'var(--danger-tint)', border: '1px solid var(--danger-line)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="ms" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
