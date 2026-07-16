// Test d'intrusion sur la base Fallora.
//
// Rejoue les attaques realistes contre les policies RLS, avec des comptes
// jetables crees puis supprimes. Ne touche a aucun compte reel.
//
// Usage : node scripts/tester-securite.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const nouveauClient = () =>
  createClient(URL, PUB, { auth: { autoRefreshToken: false, persistSession: false } });

let total = 0;
let reussis = 0;
const echecs = [];

function verifier(nom, condition, detail = '') {
  total++;
  if (condition) {
    reussis++;
    console.log(`   [OK]     ${nom}`);
  } else {
    echecs.push(nom + (detail ? ` — ${detail}` : ''));
    console.log(`   [ECHEC]  ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

const jetables = { auth: [], lignes: [], ventes: [], clientes: [] };

async function creerCompte(role) {
  const email = `test-${randomUUID().slice(0, 8)}@fallora-test.local`;
  const motDePasse = randomUUID();
  const { data: a, error: e1 } = await admin.auth.admin.createUser({
    email, password: motDePasse, email_confirm: true, app_metadata: { role },
  });
  if (e1) throw new Error(`creation auth (${role}) : ${e1.message}`);
  jetables.auth.push(a.user.id);

  const { data: l, error: e2 } = await admin
    .from('utilisateurs')
    .insert({ nom: `Test ${role}`, email, role, actif: true, auth_id: a.user.id })
    .select().single();
  if (e2) throw new Error(`creation ligne (${role}) : ${e2.message}`);
  jetables.lignes.push(l.id);

  const client = nouveauClient();
  const { error: e3 } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (e3) throw new Error(`connexion (${role}) : ${e3.message}`);
  return { client, profilId: l.id, email };
}

try {
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  1. ATTAQUANT ANONYME                                    ║');
  console.log('║     cle publishable, aucune session — ce que ferait      ║');
  console.log('║     n\'importe quel visiteur avec la console du navigateur ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const pirate = nouveauClient();

  for (const table of ['utilisateurs', 'clientes', 'ventes', 'produits', 'vente_produits', 'paiements']) {
    const { data, error } = await pirate.from(table).select('*');
    verifier(
      `lire ${table} est refuse`,
      !!error || (data?.length ?? 0) === 0,
      error ? '' : `${data?.length} ligne(s) exposee(s) !`
    );
  }

  const { error: eIns } = await pirate.from('utilisateurs')
    .insert({ nom: 'Pirate', email: `pirate-${randomUUID().slice(0,6)}@x.com`, role: 'admin', actif: true });
  verifier('creer un compte admin est refuse', !!eIns);

  const { error: eRpc } = await pirate.rpc('enregistrer_vente', {
    p_cliente_nom: 'Pirate', p_cliente_telephone: null,
    p_produits: [{ produit_id: 1, quantite: 1 }],
    p_statut_paiement: 'paye', p_montant_paye: null, p_mode_paiement: 'cash',
  });
  verifier('appeler enregistrer_vente est refuse', !!eRpc);

  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  2. VENDEUSE CONNECTEE                                   ║');
  console.log('║     compte legitime — jusqu\'ou peut-elle aller ?         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const v1 = await creerCompte('vendeuse');
  const v2 = await creerCompte('vendeuse');

  const { data: prod } = await v1.client.from('produits').select('id, prix, stock_restant').eq('actif', true).limit(1);
  verifier('elle voit le catalogue produits', (prod?.length ?? 0) > 0);

  const produit = prod?.[0];
  if (produit) {
    const { error: ePrix } = await v1.client.from('produits')
      .update({ prix: 1 }).eq('id', produit.id);
    const { data: apres } = await admin.from('produits').select('prix').eq('id', produit.id).single();
    verifier(
      'elle NE PEUT PAS changer les prix',
      !!ePrix || Number(apres.prix) === Number(produit.prix),
      !ePrix && Number(apres.prix) !== Number(produit.prix) ? 'prix modifie !' : ''
    );

    // Vente legitime via la fonction serveur.
    const stockAvant = produit.stock_restant;
    const { data: venteId, error: eVente } = await v1.client.rpc('enregistrer_vente', {
      p_cliente_nom: 'Cliente Test', p_cliente_telephone: `+000${randomUUID().slice(0, 8)}`,
      p_produits: [{ produit_id: produit.id, quantite: 1 }],
      p_statut_paiement: 'paye', p_montant_paye: null, p_mode_paiement: 'cash',
    });
    verifier('elle PEUT enregistrer une vente', !eVente && !!venteId, eVente?.message ?? '');

    if (venteId) {
      jetables.ventes.push(venteId);
      const { data: v } = await admin.from('ventes').select('total, vendeuse_id, cliente_id').eq('id', venteId).single();
      if (v?.cliente_id) jetables.clientes.push(v.cliente_id);
      verifier('le total est calcule en base, pas envoye par le client', Number(v.total) === Number(produit.prix));
      verifier('la vente est bien attribuee a son autrice', v.vendeuse_id === v1.profilId);

      const { data: st } = await admin.from('produits').select('stock_restant').eq('id', produit.id).single();
      verifier('le stock a ete decremente dans la meme transaction', st.stock_restant === stockAvant - 1);

      // Cloisonnement entre vendeuses.
      const { data: vuePar2 } = await v2.client.from('ventes').select('id').eq('id', venteId);
      verifier('une AUTRE vendeuse ne voit pas cette vente', (vuePar2?.length ?? 0) === 0);

      const { data: lignes2 } = await v2.client.from('vente_produits').select('id').eq('vente_id', venteId);
      verifier('elle ne voit pas non plus ses lignes de produits', (lignes2?.length ?? 0) === 0);

      const { data: paie2 } = await v2.client.from('paiements').select('id').eq('vente_id', venteId);
      verifier('ni ses paiements', (paie2?.length ?? 0) === 0);
    }

    // Stock insuffisant.
    const { error: eStock } = await v1.client.rpc('enregistrer_vente', {
      p_cliente_nom: 'Gourmande', p_cliente_telephone: null,
      p_produits: [{ produit_id: produit.id, quantite: 999999 }],
      p_statut_paiement: 'paye', p_montant_paye: null, p_mode_paiement: 'cash',
    });
    verifier('une vente au-dela du stock est refusee', !!eStock);
  }

  const { data: users1 } = await v1.client.from('utilisateurs').select('id');
  verifier('elle ne voit que son propre profil', users1?.length === 1, `${users1?.length} profils visibles`);

  const { error: eSuppr } = await v1.client.from('utilisateurs').delete().eq('id', v2.profilId);
  const { data: existeEncore } = await admin.from('utilisateurs').select('id').eq('id', v2.profilId);
  verifier('elle ne peut pas supprimer une collegue', !!eSuppr || existeEncore?.length === 1);

  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  3. ADMIN CONNECTE                                       ║');
  console.log('║     l\'app doit continuer de fonctionner                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const adm = await creerCompte('admin');

  const { data: tousUsers } = await adm.client.from('utilisateurs').select('id');
  verifier('il voit tous les comptes', (tousUsers?.length ?? 0) >= 3, `${tousUsers?.length} visibles`);

  const { data: toutesVentes } = await adm.client.from('ventes').select('id');
  verifier('il voit toutes les ventes', (toutesVentes?.length ?? 0) >= 1);

  const { data: toutesClientes } = await adm.client.from('clientes').select('id');
  verifier('il voit toutes les clientes', (toutesClientes?.length ?? 0) >= 1);

  if (prod?.[0]) {
    const prixOrigine = prod[0].prix;
    const { error: eMaj } = await adm.client.from('produits').update({ prix: prixOrigine }).eq('id', prod[0].id);
    verifier('il peut modifier les produits', !eMaj, eMaj?.message ?? '');
  }

  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  4. COMPTE DESACTIVE                                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await admin.from('utilisateurs').update({ actif: false }).eq('id', v1.profilId);
  const { data: apresDesac } = await v1.client.from('produits').select('id').limit(1);
  verifier(
    'un compte desactive perd l\'acces immediatement, sans attendre l\'expiration du jeton',
    (apresDesac?.length ?? 0) === 0,
    (apresDesac?.length ?? 0) > 0 ? 'il lit encore les produits !' : ''
  );
} catch (err) {
  console.log('\n   ERREUR :', err.message);
  echecs.push('exception : ' + err.message);
} finally {
  console.log('\n─── Nettoyage ───');
  for (const id of jetables.ventes) await admin.from('ventes').delete().eq('id', id);
  for (const id of jetables.clientes) await admin.from('clientes').delete().eq('id', id);
  for (const id of jetables.lignes) await admin.from('utilisateurs').delete().eq('id', id);
  for (const id of jetables.auth) await admin.auth.admin.deleteUser(id);
  const { data: reste } = await admin.from('utilisateurs').select('id').like('email', '%@fallora-test.local');
  console.log(`   ${reste?.length === 0 ? '[OK]    ' : '[ATTENTION]'} comptes jetables supprimes (${reste?.length ?? '?'} restant)`);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  ${reussis}/${total} controles passes`);
if (echecs.length) {
  console.log('\n  Echecs :');
  echecs.forEach((e) => console.log(`    - ${e}`));
} else {
  console.log('  Aucune faille detectee.');
}
console.log('═══════════════════════════════════════════════════════════\n');
process.exit(echecs.length ? 1 : 0);
