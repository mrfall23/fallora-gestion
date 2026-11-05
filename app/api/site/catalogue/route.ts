import { champsDepuisSite, clientService, jetonSiteValide, nonAutorise, type ProduitSite } from '@/lib/site';

// POST /api/site/catalogue { produits: ProduitSite[] }
// Appele par le site a chaque enregistrement de son catalogue (le site fait
// reference pour les fiches) :
//   - produit relie (web_id connu) : nom, prix, photo, description, categorie mis a jour ;
//   - nouveau produit du site : cree ici avec un stock de 0 (a reapprovisionner) ;
//   - produit retire du site : desactive ici (son historique de ventes reste).
// Tant que la liaison initiale n'est pas faite (aucun produit relie), rien
// n'est cree : la page Admin > Site web s'en charge, sans doublon.
export async function POST(request: Request) {
  if (!jetonSiteValide(request)) return nonAutorise();
  const body = await request.json().catch(() => ({}));
  const produits: ProduitSite[] = Array.isArray(body?.produits) ? body.produits.slice(0, 300) : [];
  if (!produits.length) return Response.json({ message: 'Catalogue vide.' }, { status: 400 });

  const db = clientService();
  const { data: relies, error } = await db.from('produits').select('id, web_id, actif').not('web_id', 'is', null);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  if (!relies?.length) return Response.json({ ok: true, liaison: 'a_faire', maj: 0, crees: 0, desactives: 0 });

  const parWebId = new Map(relies.map((r) => [String(r.web_id), r]));
  let maj = 0, crees = 0, desactives = 0;
  for (const p of produits) {
    const champs = champsDepuisSite(p);
    const lie = parWebId.get(String(p.id));
    if (lie) {
      const { error: e } = await db.from('produits').update({ ...champs, actif: true }).eq('id', lie.id);
      if (!e) maj++;
    } else {
      const { error: e } = await db.from('produits').insert({ ...champs, web_id: p.id, stock_restant: 0, stock_initial: 0, actif: true });
      if (!e) crees++;
    }
  }
  const idsSite = new Set(produits.map((p) => String(p.id)));
  for (const r of relies) {
    if (r.actif && !idsSite.has(String(r.web_id))) {
      const { error: e } = await db.from('produits').update({ actif: false }).eq('id', r.id);
      if (!e) desactives++;
    }
  }
  return Response.json({ ok: true, maj, crees, desactives });
}
