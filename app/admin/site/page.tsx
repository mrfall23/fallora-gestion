'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { champsDepuisSite, normaliserNom, photoAbsolue, type ProduitSite } from '@/lib/siteCommun';

// Liaison avec le site fallora-web (admin).
// Le site fait reference pour les fiches (nom, prix, photo, description,
// categorie) ; fallora-gestion pour le stock et les ventes.
// Cette page sert surtout UNE fois : relier chaque produit du site a la fiche
// boutique correspondante (son stock et son historique sont conserves), ou
// l'importer s'il n'existe pas encore ici. Ensuite, chaque modification faite
// sur le site est recopiee automatiquement.

type ProduitGestion = { id: number; nom: string; prix: number; image: string | null; stock_restant: number; actif: boolean; web_id: number | null };
const NOUVEAU = 'nouveau';

const inputStyle: React.CSSProperties = { height: '40px', padding: '0 10px', borderRadius: '10px', background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '13.5px', width: '100%' };
const carte: React.CSSProperties = { padding: '18px', borderRadius: '18px', background: 'var(--surface)', border: '1px solid var(--line)' };
const boutonPrincipal: React.CSSProperties = { height: '46px', padding: '0 22px', border: 'none', borderRadius: '14px', cursor: 'pointer', background: 'var(--accent-grad)', color: 'var(--on-accent)', fontSize: '14px', fontWeight: 700 };
const fcfa = (n: number) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;

// Ressemblance de deux noms : part de mots en commun (0 a 1).
function ressemblance(a: string, b: string) {
  const x = new Set(normaliserNom(a).split(' ').filter((m) => m.length > 1));
  const y = new Set(normaliserNom(b).split(' ').filter((m) => m.length > 1));
  if (!x.size || !y.size) return 0;
  let communs = 0;
  x.forEach((m) => { if (y.has(m)) communs++; });
  return communs / Math.max(x.size, y.size);
}

function Vignette({ src }: { src?: string | null }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, background: '#fff', border: '1px solid var(--line)', flexShrink: 0 }} />
    : <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--surface-inset)', flexShrink: 0 }} />;
}

// Catalogue du site (lu par le serveur) + fiches boutique.
async function lireDonnees(): Promise<{ site: ProduitSite[]; gestion: ProduitGestion[] }> {
  const [r, g] = await Promise.all([
    fetch('/api/site/apercu').then(async (x) => { const d = await x.json(); if (!x.ok) throw new Error(d.message); return d; }),
    supabase.from('produits').select('id, nom, prix, image, stock_restant, actif, web_id').order('nom'),
  ]);
  if (g.error) throw new Error(g.error.message.includes('web_id') ? "La base n'est pas encore prête : exécutez la migration « liaison_site » dans Supabase." : g.error.message);
  return { site: r.produits || [], gestion: (g.data || []) as ProduitGestion[] };
}

export default function AdminSite() {
  const [site, setSite] = useState<ProduitSite[]>([]);
  const [gestion, setGestion] = useState<ProduitGestion[]>([]);
  const [choix, setChoix] = useState<Record<string, string>>({}); // id site -> id gestion | NOUVEAU
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  // Les setState arrivent dans les callbacks de la promesse (jamais dans le corps de l'effet).
  const appliquer = (d: { site: ProduitSite[]; gestion: ProduitGestion[] }) => {
    setSite(d.site);
    setGestion(d.gestion);
    setChargement(false);
  };
  const echec = (e: Error) => {
    setMessage({ ok: false, texte: e.message || 'Chargement impossible.' });
    setChargement(false);
  };
  const charger = () => lireDonnees().then(appliquer, echec);
  useEffect(() => { lireDonnees().then(appliquer, echec); }, []);

  const lies = useMemo(() => new Map(gestion.filter((p) => p.web_id != null).map((p) => [String(p.web_id), p])), [gestion]);
  const libres = gestion.filter((p) => p.web_id == null);
  const aRelier = site.filter((p) => !lies.has(String(p.id)));

  // Suggestion pour chaque produit du site : la fiche boutique libre au nom le plus proche.
  const suggestions = useMemo(() => {
    const prises = new Set<number>();
    const out: Record<string, string> = {};
    for (const p of aRelier) {
      let meilleur: ProduitGestion | null = null;
      let score = 0;
      for (const g of libres) {
        if (prises.has(g.id)) continue;
        const s = ressemblance(p.nom, g.nom);
        if (s > score) { score = s; meilleur = g; }
      }
      if (meilleur && score >= 0.5) { out[String(p.id)] = String(meilleur.id); prises.add(meilleur.id); }
      else out[String(p.id)] = NOUVEAU;
    }
    return out;
  }, [aRelier, libres]);
  const choixDe = (id: number) => choix[String(id)] ?? suggestions[String(id)] ?? NOUVEAU;

  const relierTout = async () => {
    const doublons = aRelier.map((p) => choixDe(p.id)).filter((c) => c !== NOUVEAU);
    if (new Set(doublons).size !== doublons.length) {
      setMessage({ ok: false, texte: 'Une même fiche boutique est choisie pour deux produits du site. Corrigez avant de valider.' });
      return;
    }
    if (!window.confirm(`Relier ${aRelier.length} produit(s) du site à fallora-gestion ? Les fiches boutique choisies prendront le nom, le prix et la photo du site (leur stock et leurs ventes sont conservés).`)) return;
    setOccupe(true);
    setMessage(null);
    let ok = 0;
    const erreurs: string[] = [];
    for (const p of aRelier) {
      const c = choixDe(p.id);
      const champs = champsDepuisSite(p);
      const { error } = c === NOUVEAU
        ? await supabase.from('produits').insert({ ...champs, web_id: p.id, stock_restant: 0, stock_initial: 0, actif: true })
        : await supabase.from('produits').update({ ...champs, web_id: p.id, actif: true }).eq('id', Number(c));
      if (error) erreurs.push(`${p.nom} : ${error.message}`); else ok++;
    }
    setOccupe(false);
    setMessage(erreurs.length
      ? { ok: false, texte: `${ok} relié(s). Problèmes : ${erreurs.join(' · ')}` }
      : { ok: true, texte: `${ok} produit(s) relié(s) ✓ Pensez à vérifier le stock des nouveaux produits (créés à 0).` });
    charger();
  };

  const mettreAJour = async () => {
    setOccupe(true);
    let ok = 0;
    for (const p of site) {
      const g = lies.get(String(p.id));
      if (!g) continue;
      const { error } = await supabase.from('produits').update(champsDepuisSite(p)).eq('id', g.id);
      if (!error) ok++;
    }
    setOccupe(false);
    setMessage({ ok: true, texte: `${ok} fiche(s) mise(s) à jour depuis le site ✓` });
    charger();
  };

  const delier = async (g: ProduitGestion) => {
    if (!window.confirm(`Délier « ${g.nom} » du site ? Son stock ne sera plus visible en ligne.`)) return;
    const { error } = await supabase.from('produits').update({ web_id: null }).eq('id', g.id);
    setMessage(error ? { ok: false, texte: error.message } : { ok: true, texte: 'Produit délié.' });
    charger();
  };

  if (chargement) return <div className="fade-up" style={{ color: 'var(--ink-55)' }}>Chargement…</div>;

  return (
    <div className="fade-up">
      <div style={{ ...carte, marginBottom: 20, background: 'var(--surface-2)', border: '1px solid var(--accent-20)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-70)' }}>
        <strong style={{ color: 'var(--ink)' }}>Comment ça marche.</strong> Le <strong>site</strong> fait référence pour les fiches produits
        (nom, prix, photo, description) : chaque modification faite sur le site est recopiée ici. <strong>fallora-gestion</strong> fait
        référence pour le <strong>stock</strong> : le site affiche ce stock, et chaque commande en ligne le réserve ici
        (rendu si la commande est annulée).
      </div>

      {message && (
        <div role="status" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 14, fontSize: 13.5, background: message.ok ? 'var(--success-tint)' : 'var(--danger-tint)', border: `1px solid ${message.ok ? 'var(--success-line)' : 'var(--danger-line)'}`, color: message.ok ? 'var(--success)' : 'var(--danger)' }}>
          {message.texte}
        </div>
      )}

      {aRelier.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>À relier ({aRelier.length})</div>
              <div style={{ fontSize: 13, color: 'var(--ink-55)' }}>Pour chaque produit du site, choisissez la fiche boutique correspondante, ou « Nouveau produit ».</div>
            </div>
            <button onClick={relierTout} disabled={occupe} style={{ ...boutonPrincipal, opacity: occupe ? 0.6 : 1 }}>
              {occupe ? 'En cours…' : `Relier les ${aRelier.length} produits`}
            </button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {aRelier.map((p) => (
              <div key={p.id} style={{ ...carte, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <Vignette src={photoAbsolue((p.images && p.images[0]) || p.image)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{p.nom}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-55)' }}>Site · {fcfa(p.prixNum)}</div>
                  </div>
                </div>
                <select value={choixDe(p.id)} onChange={(e) => setChoix({ ...choix, [String(p.id)]: e.target.value })} style={inputStyle} aria-label={`Fiche boutique pour ${p.nom}`}>
                  <option value={NOUVEAU}>➕ Nouveau produit (stock 0)</option>
                  {libres.map((g) => (
                    <option key={g.id} value={String(g.id)}>{g.nom} — stock {g.stock_restant}{g.actif ? '' : ' (inactif)'}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Reliés au site ({lies.size})</div>
          {lies.size > 0 && (
            <button onClick={mettreAJour} disabled={occupe} style={{ height: 40, padding: '0 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-70)', cursor: 'pointer', fontSize: 13.5 }}>
              Recopier les fiches du site
            </button>
          )}
        </div>
        {lies.size === 0 ? (
          <div style={{ ...carte, color: 'var(--ink-55)', fontSize: 14 }}>Aucun produit relié pour l&apos;instant.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {site.filter((p) => lies.has(String(p.id))).map((p) => {
              const g = lies.get(String(p.id))!;
              return (
                <div key={p.id} style={{ ...carte, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Vignette src={g.image} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{g.nom}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-55)' }}>{fcfa(g.prix)} · stock <strong style={{ color: g.stock_restant > 0 ? 'var(--ink)' : 'var(--danger)' }}>{g.stock_restant}</strong>{g.actif ? '' : ' · inactif'}</div>
                  </div>
                  <button onClick={() => delier(g)} style={{ border: 'none', background: 'none', color: 'var(--ink-45)', cursor: 'pointer', fontSize: 12.5 }}>Délier</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {libres.length > 0 && lies.size > 0 && (
        <section>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Fiches boutique absentes du site ({libres.length})</div>
          <div style={{ fontSize: 13, color: 'var(--ink-55)', marginBottom: 10 }}>
            Elles restent vendables en boutique. Si ce sont d&apos;anciens produits, vous pouvez les désactiver dans « Produits ».
          </div>
          <div style={{ ...carte, fontSize: 13.5, color: 'var(--ink-70)', lineHeight: 1.7 }}>
            {libres.map((g) => g.nom).join(' · ')}
          </div>
        </section>
      )}
    </div>
  );
}
