// Migration des comptes utilisateurs vers Supabase Auth.
//
// Lit public.utilisateurs, cree le compte correspondant dans auth.users en
// reprenant le mot de passe actuel, puis renseigne utilisateurs.auth_id.
//
// Idempotent : relancable sans risque, les comptes deja migres sont ignores.
// Usage : node scripts/migrer-vers-auth.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

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
const secretKey = env.SUPABASE_SECRET_KEY;

if (!secretKey) {
  console.error('\n  SUPABASE_SECRET_KEY absente de .env.local.');
  console.error('  Dashboard > Project Settings > API Keys > create secret key\n');
  process.exit(1);
}

if (secretKey.startsWith('eyJ')) {
  console.error('\n  Cette cle est un ancien JWT (service_role), pas une cle sb_secret_.');
  console.error('  Les cles sb_secret_ renvoient 401 si elles fuient vers un navigateur —');
  console.error('  garde-fou que les anciennes n\'ont pas. Cree une cle secrete dans');
  console.error('  Dashboard > Project Settings > API Keys, puis supprime la service_role.\n');
  process.exit(1);
}

// Cle secrete : contourne RLS. Ce script tourne en local uniquement, jamais
// dans du code expedie au navigateur.
const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: utilisateurs, error } = await admin
  .from('utilisateurs')
  .select('id, nom, email, mot_de_passe, role, actif, auth_id')
  .order('id');

if (error) {
  console.error('  Lecture de utilisateurs impossible :', error.message);
  process.exit(1);
}

// Comptes auth deja presents, pour rendre le script relancable.
const { data: existants } = await admin.auth.admin.listUsers({ perPage: 1000 });
const parEmail = new Map((existants?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

console.log(`\n  ${utilisateurs.length} compte(s) a traiter\n`);

let crees = 0;
let lies = 0;
let ignores = 0;
const echecs = [];

for (const u of utilisateurs) {
  const email = u.email.trim().toLowerCase();

  if (u.auth_id) {
    console.log(`  = ${email} — deja migre`);
    ignores++;
    continue;
  }

  let authUser = parEmail.get(email);

  if (authUser) {
    console.log(`  ~ ${email} — compte auth deja present, on relie`);
  } else {
    if (!u.mot_de_passe || u.mot_de_passe.length < 6) {
      echecs.push(`${email} — mot de passe absent ou < 6 caracteres (minimum Supabase)`);
      console.log(`  ! ${email} — ECHEC : mot de passe trop court`);
      continue;
    }

    const { data: cree, error: eCreate } = await admin.auth.admin.createUser({
      email,
      password: u.mot_de_passe,
      email_confirm: true,
      user_metadata: { nom: u.nom },
      app_metadata: { role: u.role },
    });

    if (eCreate) {
      echecs.push(`${email} — ${eCreate.message}`);
      console.log(`  ! ${email} — ECHEC : ${eCreate.message}`);
      continue;
    }

    authUser = cree.user;
    crees++;
    console.log(`  + ${email} — compte auth cree (role: ${u.role})`);
  }

  const { error: eLink } = await admin
    .from('utilisateurs')
    .update({ auth_id: authUser.id })
    .eq('id', u.id);

  if (eLink) {
    echecs.push(`${email} — liaison auth_id : ${eLink.message}`);
    console.log(`  ! ${email} — ECHEC liaison : ${eLink.message}`);
    continue;
  }

  lies++;
}

console.log(`\n  ─────────────────────────────────`);
console.log(`  crees : ${crees}   lies : ${lies}   deja faits : ${ignores}`);

if (echecs.length) {
  console.log(`\n  ${echecs.length} echec(s) :`);
  echecs.forEach((e) => console.log(`    - ${e}`));
  process.exit(1);
}

console.log(`\n  Migration terminee.\n`);
