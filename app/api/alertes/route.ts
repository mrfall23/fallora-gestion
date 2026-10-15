import { NextResponse } from 'next/server';
import { creerClientServeur } from '@/lib/supabase-server';
import { telegramConfigure, envoyerTelegram } from '@/lib/telegram';

// Etat des alertes Telegram (GET) et envoi d'une alerte de test (POST).
// Reserve a l'admin.

async function estAdmin(): Promise<boolean> {
  const supabase = await creerClientServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profil } = await supabase
    .from('utilisateurs')
    .select('role, actif')
    .eq('auth_id', user.id)
    .single();
  return !!profil && profil.actif && profil.role === 'admin';
}

export async function GET() {
  if (!(await estAdmin())) return NextResponse.json({ message: 'Acces refuse.' }, { status: 403 });
  return NextResponse.json({ telegram: telegramConfigure() });
}

export async function POST(request: Request) {
  if (!(await estAdmin())) return NextResponse.json({ message: 'Acces refuse.' }, { status: 403 });
  if (!telegramConfigure()) {
    return NextResponse.json({ ok: false, message: 'Telegram non configuré : ajoutez TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID dans Vercel.' }, { status: 400 });
  }
  const r = await envoyerTelegram([
    '✅ Fallora — Alerte de test',
    '',
    'Les alertes Telegram fonctionnent. Vous recevrez ici chaque nouvelle vente et les alertes de stock bas.',
    '',
    `→ ${new URL(request.url).origin}/admin`,
  ].join('\n'));
  if (!r.ok) return NextResponse.json({ ok: false, message: `Échec de l'envoi : ${r.detail}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
