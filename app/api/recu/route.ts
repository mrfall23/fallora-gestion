import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase-server';

// Heberge l'image d'un reçu dans le bucket public "recus" et renvoie son URL.
// L'upload passe par la cle secrete (contourne les policies Storage). Le bucket
// doit exister et etre public (voir migration / reglage Storage).

function clientAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SECRET_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: Request) {
  // Seul un utilisateur connecte (vendeuse ou admin) peut heberger un reçu.
  const supabase = await creerClientServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Non authentifie.' }, { status: 401 });

  const { image, numero } = await request.json().catch(() => ({}));
  if (!image || typeof image !== 'string') {
    return NextResponse.json({ message: 'Image manquante.' }, { status: 400 });
  }

  // image = data URL "data:image/png;base64,AAAA..."
  const base64 = image.includes(',') ? image.split(',')[1] : image;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > 5_000_000) {
    return NextResponse.json({ message: 'Image invalide.' }, { status: 400 });
  }

  const admin = clientAdmin();
  const suffixe = Math.random().toString(36).slice(2, 10);
  const nomFichier = `recu-${String(numero || 'x').replace(/[^0-9-]/g, '')}-${suffixe}.png`;

  const { error } = await admin.storage.from('recus').upload(nomFichier, buffer, {
    contentType: 'image/png',
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ message: error.message || "Echec de l'hebergement." }, { status: 500 });
  }

  const { data } = admin.storage.from('recus').getPublicUrl(nomFichier);
  return NextResponse.json({ url: data.publicUrl });
}
