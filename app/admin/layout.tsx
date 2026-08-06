'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUtilisateur, seDeconnecter } from '@/lib/utilisateur';
import { FalloraLogo } from '../components/Logo';
import { useIsMobile } from '../components/useMediaQuery';
import PushToggle from '../components/PushToggle';

const NAV = [
  { href: '/admin', icon: 'dashboard', label: 'Tableau de bord' },
  { href: '/admin/produits', icon: 'inventory_2', label: 'Produits' },
  { href: '/admin/ventes', icon: 'receipt_long', label: 'Ventes' },
  { href: '/admin/vendeuses', icon: 'emoji_events', label: 'Vendeuses' },
  { href: '/admin/clients', icon: 'people', label: 'Clientes' },
  { href: '/admin/rapports', icon: 'download', label: 'Rapports' },
  { href: '/admin/parametres', icon: 'manage_accounts', label: 'Comptes' },
];

const TITRES: Record<string, [string, string]> = {
  '/admin': ['Tableau de bord', "Vue d'ensemble de votre activité"],
  '/admin/produits': ['Gestion des produits', 'Catalogue et niveaux de stock'],
  '/admin/ventes': ['Ventes', 'Historique des transactions'],
  '/admin/vendeuses': ['Performance des vendeuses', 'Classement et statistiques du mois'],
  '/admin/clients': ['Clientes', 'Profils et historique des achats'],
  '/admin/rapports': ['Rapports', 'Exportez vos données au format Excel'],
  '/admin/parametres': ['Gestion des comptes', 'Ajouter et gérer les vendeuses'],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // useUtilisateur('admin') verifie la session Supabase et renvoie ailleurs
  // toute personne qui n'est pas admin. L'ancien controle lisait un role
  // dans le localStorage, modifiable depuis la console du navigateur.
  const { utilisateur: user } = useUtilisateur('admin');
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const deconnecter = seDeconnecter;

  if (!user) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  const [pageTitle, pageSub] = TITRES[pathname] || ['', ''];
  const initial = user.nom?.trim()[0]?.toUpperCase() || 'A';

  const naviguer = (href: string) => { router.push(href); setMenuOuvert(false); };

  // Sur mobile la sidebar sort du flux (tiroir superposé) ; sur desktop elle
  // reste une colonne fixe de la grille.
  const asideStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', top: 0, left: 0, height: '100vh', width: '260px', zIndex: 60, transform: menuOuvert ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .28s ease', display: 'flex', flexDirection: 'column', padding: '22px 18px', background: 'var(--sidebar)', borderRight: '1px solid var(--line)', boxShadow: menuOuvert ? '0 0 60px rgba(62,44,32,.25)' : 'none' }
    : { position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '26px 18px', background: 'var(--sidebar)', borderRight: '1px solid var(--line)' };

  return (
    <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '252px 1fr', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Backdrop mobile */}
      {isMobile && menuOuvert && (
        <div onClick={() => setMenuOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(62,44,32,.4)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* ── SIDEBAR ── */}
      <aside style={asideStyle}>

        {/* Logo */}
        <div style={{ padding: '4px 10px 26px' }}>
          <FalloraLogo layout="row" markSize={34} wordSize={26} />
        </div>

        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--ink-35)', padding: '0 12px 12px' }}>MENU</div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {NAV.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <button key={item.href} onClick={() => naviguer(item.href)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', borderRadius: '14px', cursor: 'pointer', border: 'none', width: '100%', textAlign: 'left', fontFamily: "var(--font-manrope), sans-serif", fontSize: '14.5px', fontWeight: active ? 600 : 500, letterSpacing: '.2px', background: active ? 'var(--accent-16)' : 'transparent', color: active ? 'var(--accent-deep)' : 'var(--ink-70)', boxShadow: active ? 'inset 0 0 0 1px var(--accent-25)' : 'none' }}>
                <span className="ms" style={{ fontSize: '21px', color: active ? 'var(--accent)' : 'var(--ink-45)' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bas de sidebar : notifications (admin) + profil */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '14px' }}>
        <PushToggle />
        <div style={{ padding: '14px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent-25)', flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-cormorant), serif", fontSize: '18px', color: 'var(--accent)', fontWeight: 600 }}>{initial}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.nom}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-45)' }}>Administratrice</div>
          </div>
          <button onClick={deconnecter} title="Déconnexion" aria-label="Se déconnecter" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex' }}>
            <span className="ms" style={{ fontSize: '20px', color: 'var(--ink-45)' }}>logout</span>
          </button>
        </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '30%', width: '500px', height: '300px', background: 'radial-gradient(ellipse,rgba(169,103,61,.06),transparent 70%)', pointerEvents: 'none' }} />

        {/* Header */}
        <header style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '20px', padding: isMobile ? '16px 18px' : '22px 40px', background: 'rgba(236,229,214,.78)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--line)' }}>
          {isMobile && (
            <button onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '11px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <span className="ms" style={{ fontSize: '24px', color: 'var(--ink)' }}>menu</span>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-cormorant), serif", fontSize: isMobile ? '22px' : '30px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageTitle}</div>
            {!isMobile && <div style={{ fontSize: '13.5px', color: 'var(--ink-45)', marginTop: '2px' }}>{pageSub}</div>}
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: isMobile ? '20px 16px 48px' : '32px 40px 56px', position: 'relative' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
