import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import RegisterSW from "./components/RegisterSW";

// Auto-hebergees par Next : plus aucune requete bloquante vers Google Fonts,
// zero decalage de mise en page (FOUT). Exposees en variables CSS reutilisees
// dans globals.css et les styles inline (var(--font-cormorant / --font-manrope)).
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fallora — Gestion",
  description: "Application de gestion des ventes privées Fallora",
  appleWebApp: { capable: true, title: "Fallora", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ECE5D6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${cormorant.variable}`}>
      <head>
        {/* Police d'icones : gardee en lien (police variable a axes multiples,
            hors du perimetre de next/font). Les polices de texte, elles, sont
            auto-hebergees ci-dessus. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0,0" />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
