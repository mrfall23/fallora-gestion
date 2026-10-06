import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase-server';
import { notifierVente, notifierStockBas } from '@/lib/push';
import { SEUIL_STOCK_BAS } from '@/lib/constantes';

// Enregistrement d'une vente, cote serveur, pour pouvoir notifier l'admin.
//
// La vente elle-meme passe TOUJOURS par la RPC enregistrer_vente() : meme
// atomicite, meme verrouillage de stock, memes prix lus en base. On appelle
// la RPC avec la session de la vendeuse (creerClientServeur lit son cookie),
// donc mon_profil_id() la reconnait exactement comme avant.
//
// La notification est un BONUS best-effort : si elle echoue, la vente reste
// valide et la reponse reste un succes.

function clientAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SECRET_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: Request) {
  const supabase = await creerClientServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Non authentifie.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { cliente_nom, cliente_telephone, produits, statut_paiement, montant_paye, mode_paiement } = body;

  const { data: venteId, error } = await supabase.rpc('enregistrer_vente', {
    p_cliente_nom: cliente_nom,
    p_cliente_telephone: cliente_telephone ?? null,
    p_produits: produits,
    p_statut_paiement: statut_paiement,
    p_montant_paye: montant_paye ?? null,
    p_mode_paiement: mode_paiement,
  });

  if (error) {
    // Messages metier utiles (stock insuffisant, montant invalide...) renvoyes tels quels.
    return NextResponse.json({ message: error.message || "Erreur lors de l'enregistrement." }, { status: 400 });
  }

  // ── Notification admin (best-effort, jamais bloquante) ──
  try {
    const admin = clientAdmin();
    const { data: v } = await admin
      .from('ventes')
      .select('total, statut_paiement, cliente_id, vendeuse_id')
      .eq('id', venteId)
      .single();

    if (v) {
      const [{ data: cli }, { data: ven }] = await Promise.all([
        v.cliente_id ? admin.from('clientes').select('nom').eq('id', v.cliente_id).single() : Promise.resolve({ data: null }),
        v.vendeuse_id ? admin.from('utilisateurs').select('nom').eq('id', v.vendeuse_id).single() : Promise.resolve({ data: null }),
      ]);
      await notifierVente({
        vendeuse: (ven as any)?.nom || 'Une vendeuse',
        cliente: (cli as any)?.nom || 'Cliente',
        total: Number(v.total) || 0,
        statut: v.statut_paiement,
      });
    }
  } catch (e) {
    console.error('Notification de vente echouee (sans impact sur la vente) :', e);
  }

  // ── Alerte stock bas (best-effort) ──
  // On n'alerte qu'au FRANCHISSEMENT du seuil : le stock d'apres-vente est <=
  // au seuil alors que le stock d'avant (apres + quantite vendue) etait > au
  // seuil. Une seule alerte quand un produit y bascule, pas a chaque vente.
  try {
    const lignes: { produit_id: number; quantite: number }[] = Array.isArray(produits) ? produits : [];
    if (lignes.length > 0) {
      const admin = clientAdmin();
      const ids = lignes.map(l => Number(l.produit_id));
      const { data: prods } = await admin
        .from('produits')
        .select('id, nom, stock_restant')
        .in('id', ids);

      const franchis = (prods || [])
        .map((p: any) => {
          const vendu = lignes.filter(l => Number(l.produit_id) === p.id).reduce((s, l) => s + Number(l.quantite), 0);
          const apres = Number(p.stock_restant);
          const avant = apres + vendu;
          return { nom: p.nom, stock: apres, franchi: avant > SEUIL_STOCK_BAS && apres <= SEUIL_STOCK_BAS };
        })
        .filter(p => p.franchi)
        .map(({ nom, stock }) => ({ nom, stock }));

      if (franchis.length > 0) await notifierStockBas(franchis);
    }
  } catch (e) {
    console.error('Alerte stock bas echouee (sans impact sur la vente) :', e);
  }

  return NextResponse.json({ ok: true, id: venteId });
}
