import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from './vapid';

// Envoi des notifications Web Push cote serveur. Les cles VAPID viennent des
// variables d'environnement (VAPID_PRIVATE_KEY reste secrete, la publique est
// aussi utilisee cote navigateur). Sans ces cles, la fonction ne fait rien.

let configure = false;
function configurer() {
  if (configure) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:andrembarga98@gmail.com',
    VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  configure = true;
}

// Client a cle secrete : contourne RLS pour lire les abonnements et purger
// ceux qui ont expire.
function clientAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SECRET_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type InfosVente = { vendeuse: string; cliente: string; total: number; statut: string };

/** Notifie tous les appareils admin abonnes. Best-effort : n'echoue jamais bruyamment. */
export async function notifierVente(v: InfosVente) {
  if (!process.env.VAPID_PRIVATE_KEY) return; // pas de cle privee -> notifications desactivees
  configurer();

  const admin = clientAdmin();
  const { data: abos } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (!abos || abos.length === 0) return;

  const statutTxt = v.statut === 'paye' ? 'payé' : 'partiel';
  const payload = JSON.stringify({
    title: '🛍️ Nouvelle vente',
    body: `${v.vendeuse} : ${v.total.toLocaleString('fr-FR')} FCFA — ${v.cliente} (${statutTxt})`,
    tag: 'vente',
    url: '/admin',
  });

  const morts: number[] = [];
  await Promise.all(
    abos.map(async (a: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          payload,
        );
      } catch (e: any) {
        // 404 / 410 : l'abonnement n'existe plus cote navigateur → on le retire.
        if (e?.statusCode === 404 || e?.statusCode === 410) morts.push(a.id);
      }
    }),
  );

  if (morts.length) await admin.from('push_subscriptions').delete().in('id', morts);
}
