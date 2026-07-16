import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase-server';

// Creation et modification des comptes vendeuses.
//
// Cette route utilise la cle secrete, qui CONTOURNE RLS. Elle doit donc
// verifier elle-meme que l'appelant est un admin actif : ici, aucune policy
// ne nous protege. Toute route qui touche a cette cle porte cette charge.

function clientAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SECRET_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Verifie la session de l'appelant. Renvoie une reponse d'erreur, ou null si admin. */
async function refuserSiPasAdmin() {
  const supabase = await creerClientServeur();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Non authentifie.' }, { status: 401 });
  }

  // On lit le role dans la table, pas dans le jeton : app_metadata peut etre
  // devenu obsolete si le role a change depuis la derniere connexion.
  const { data: profil } = await supabase
    .from('utilisateurs')
    .select('role, actif')
    .eq('auth_id', user.id)
    .single();

  if (!profil || !profil.actif || profil.role !== 'admin') {
    return NextResponse.json({ message: 'Acces refuse.' }, { status: 403 });
  }

  return null;
}

export async function POST(request: Request) {
  const refus = await refuserSiPasAdmin();
  if (refus) return refus;

  const { nom, email, motDePasse } = await request.json();

  if (!nom?.trim() || !email?.trim() || !motDePasse?.trim()) {
    return NextResponse.json({ message: 'Tous les champs sont obligatoires.' }, { status: 400 });
  }
  if (motDePasse.length < 6) {
    return NextResponse.json(
      { message: 'Le mot de passe doit faire au moins 6 caracteres.' },
      { status: 400 }
    );
  }

  const admin = clientAdmin();
  const emailNormalise = email.trim().toLowerCase();

  const { data: cree, error: erreurAuth } = await admin.auth.admin.createUser({
    email: emailNormalise,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom: nom.trim() },
    app_metadata: { role: 'vendeuse' },
  });

  if (erreurAuth) {
    const dejaPris = /already|exists|registered/i.test(erreurAuth.message);
    return NextResponse.json(
      { message: dejaPris ? 'Cet email est deja utilise.' : 'Erreur lors de la creation du compte.' },
      { status: dejaPris ? 409 : 500 }
    );
  }

  const { error: erreurLigne } = await admin.from('utilisateurs').insert({
    nom: nom.trim(),
    email: emailNormalise,
    role: 'vendeuse',
    actif: true,
    auth_id: cree.user.id,
  });

  if (erreurLigne) {
    // Sans rollback, on laisserait un compte auth orphelin capable de se
    // connecter sans profil metier.
    await admin.auth.admin.deleteUser(cree.user.id);
    const dejaPris = erreurLigne.code === '23505';
    return NextResponse.json(
      { message: dejaPris ? 'Cet email est deja utilise.' : 'Erreur lors de la creation du compte.' },
      { status: dejaPris ? 409 : 500 }
    );
  }

  return NextResponse.json({ message: 'Compte cree.' }, { status: 201 });
}

export async function PATCH(request: Request) {
  const refus = await refuserSiPasAdmin();
  if (refus) return refus;

  const { id, nom, email, motDePasse } = await request.json();

  if (!id || !nom?.trim() || !email?.trim()) {
    return NextResponse.json({ message: 'Nom et email sont obligatoires.' }, { status: 400 });
  }
  if (motDePasse && motDePasse.length < 6) {
    return NextResponse.json(
      { message: 'Le mot de passe doit faire au moins 6 caracteres.' },
      { status: 400 }
    );
  }

  const admin = clientAdmin();
  const emailNormalise = email.trim().toLowerCase();

  const { data: cible } = await admin
    .from('utilisateurs')
    .select('auth_id, role')
    .eq('id', id)
    .single();

  if (!cible?.auth_id) {
    return NextResponse.json({ message: 'Compte introuvable.' }, { status: 404 });
  }
  // Cette route ne gere que les vendeuses : elle ne doit pas servir a
  // reprendre la main sur un compte admin.
  if (cible.role !== 'vendeuse') {
    return NextResponse.json({ message: 'Ce compte n\'est pas modifiable ici.' }, { status: 403 });
  }

  const { error: erreurAuth } = await admin.auth.admin.updateUserById(cible.auth_id, {
    email: emailNormalise,
    ...(motDePasse ? { password: motDePasse } : {}),
    user_metadata: { nom: nom.trim() },
  });

  if (erreurAuth) {
    const dejaPris = /already|exists|registered/i.test(erreurAuth.message);
    return NextResponse.json(
      { message: dejaPris ? 'Cet email est deja utilise.' : 'Erreur lors de la modification.' },
      { status: dejaPris ? 409 : 500 }
    );
  }

  const { error: erreurLigne } = await admin
    .from('utilisateurs')
    .update({ nom: nom.trim(), email: emailNormalise })
    .eq('id', id);

  if (erreurLigne) {
    return NextResponse.json({ message: 'Erreur lors de la modification.' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Compte mis a jour.' });
}
