import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase-server';
import { notifierVente, notifierStockBas } from '@/lib/push';
import { telegramConfigure, envoyerTelegram, texteVente, texteStockBas } from '@/lib/telegram';
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
  const { cliente_id, cliente_nom, cliente_telephone, produits, statut_paiement, montant_paye, mode_paiement } = body;

  const { data: venteId, error } = await supabase.rpc('enregistrer_vente', {
    p_cliente_nom: cliente_nom,
    p_cliente_telephone: cliente_telephone ?? null,
    p_produits: produits,
    p_statut_paiement: statut_paiement,
    p_montant_paye: montant_paye ?? null,
    p_mode_paiement: mode_paiement,
    // Envoye seulement s'il existe : une vente sans cliente choisie reste
    // compatible avec l'ancienne signature de la RPC.
    ...(cliente_id ? { p_cliente_id: Number(cliente_id) } : {}),
  });

  if (error) {
    // Messages metier utiles (stock insuffisant, montant invalide...) renvoyes tels quels.
    return NextResponse.json({ message: error.message || "Erreur lors de l'enregistrement." }, { status: 400 });
  }

  const siteUrl = new URL(request.url).origin;

  // ── Notification admin : push + Telegram (best-effort, jamais bloquante) ──
  try {
    const admin = clientAdmin();
    const { data: v } = await admin
      .from('ventes')
      .select('total, montant_paye, reste_a_payer, statut_paiement, cliente_id, vendeuse_id')
      .eq('id', venteId)
      .single();

    if (v) {
      const [{ data: cli }, { data: ven }, { data: lignes }] = await Promise.all([
        v.cliente_id ? admin.from('clientes').select('nom, telephone').eq('id', v.cliente_id).single() : Promise.resolve({ data: null }),
        v.vendeuse_id ? admin.from('utilisateurs').select('nom').eq('id', v.vendeuse_id).single() : Promise.resolve({ data: null }),
        admin.from('vente_produits').select('produit_id, quantite, prix_unitaire').eq('vente_id', venteId),
      ]);
      const ids = (lignes || []).map((l: any) => l.produit_id);
      const { data: noms } = ids.length ? await admin.from('produits').select('id, nom').in('id', ids) : { data: [] as any[] };
      const vendeuse = (ven as any)?.nom || 'Une vendeuse';
      const cliente = (cli as any)?.nom || 'Cliente';

      await Promise.all([
        notifierVente({ vendeuse, cliente, total: Number(v.total) || 0, statut: v.statut_paiement }),
        telegramConfigure() ? envoyerTelegram(texteVente({
          id: venteId as number,
          vendeuse,
          cliente,
          telephone: (cli as any)?.telephone || null,
          articles: (lignes || []).map((l: any) => ({
            nom: (noms || []).find((p: any) => p.id === l.produit_id)?.nom || 'Produit',
            quantite: Number(l.quantite) || 0,
            prix: Number(l.prix_unitaire) || 0,
          })),
          total: Number(v.total) || 0,
          paye: Number(v.montant_paye) || 0,
          reste: Number(v.reste_a_payer) || 0,
          mode: mode_paiement || 'cash',
        }, siteUrl)) : Promise.resolve(),
      ]);
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

      if (franchis.length > 0) {
        await Promise.all([
          notifierStockBas(franchis),
          telegramConfigure() ? envoyerTelegram(texteStockBas(franchis, siteUrl)) : Promise.resolve(),
        ]);
      }
    }
  } catch (e) {
    console.error('Alerte stock bas echouee (sans impact sur la vente) :', e);
  }

  return NextResponse.json({ ok: true, id: venteId });
}
