// Verifie la chaine d'authentification de bout en bout avec un compte jetable.
// Ne touche a aucun compte reel et ne lit aucun mot de passe existant.
// Usage : node scripts/verifier-login.mjs

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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `test-${randomUUID().slice(0, 8)}@fallora-test.local`;
const motDePasse = randomUUID();
let authId = null;
let ligneId = null;
let ok = true;
const dire = (bon, texte) => {
  console.log(`   ${bon ? 'OK  ' : '!!  '}${texte}`);
  if (!bon) ok = false;
};

try {
  console.log('\n  Compte jetable :', email, '\n');

  const { data: cree, error: e1 } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    app_metadata: { role: 'vendeuse' },
  });
  if (e1) throw new Error('creation auth : ' + e1.message);
  authId = cree.user.id;

  const { data: ligne, error: e2 } = await admin
    .from('utilisateurs')
    .insert({ nom: 'Compte de test', email, role: 'vendeuse', actif: true, auth_id: authId })
    .select()
    .single();
  if (e2) throw new Error('creation ligne : ' + e2.message);
  ligneId = ligne.id;

  console.log('  --- Connexion ---');

  const { data: bonne, error: e3 } = await anon.auth.signInWithPassword({ email, password: motDePasse });
  dire(!e3 && !!bonne?.session, 'le bon mot de passe ouvre une session');

  const { error: e4 } = await anon.auth.signInWithPassword({ email, password: 'mauvais-mot-de-passe' });
  dire(!!e4, 'le mauvais mot de passe est refuse');

  console.log('\n  --- Contenu du jeton ---');
  if (bonne?.session) {
    const claims = JSON.parse(Buffer.from(bonne.session.access_token.split('.')[1], 'base64').toString());
    dire(claims.app_metadata?.role === 'vendeuse', `le role voyage dans le jeton signe (role: ${claims.app_metadata?.role})`);
    dire(!!claims.exp, `le jeton expire (dans ${Math.round((claims.exp - claims.iat) / 60)} min)`);
    dire(claims.sub === authId, 'le jeton identifie le bon utilisateur');
  }

  console.log('\n  --- Compte desactive ---');
  await admin.from('utilisateurs').update({ actif: false }).eq('id', ligneId);
  const { data: profil } = await anon.from('utilisateurs').select('actif').eq('auth_id', authId).single();
  dire(profil?.actif === false, 'un compte desactive est bien vu comme inactif par l\'app');
} catch (err) {
  console.log('\n   ECHEC :', err.message);
  ok = false;
} finally {
  console.log('\n  --- Nettoyage ---');
  if (ligneId) await admin.from('utilisateurs').delete().eq('id', ligneId);
  if (authId) await admin.auth.admin.deleteUser(authId);
  const { data: reste } = await admin.from('utilisateurs').select('id').eq('email', email);
  console.log(`   ${reste?.length === 0 ? 'OK  ' : '!!  '}compte de test supprime`);
}

console.log(ok ? '\n  Chaine d\'authentification validee.\n' : '\n  Des controles ont echoue.\n');
process.exit(ok ? 0 : 1);
