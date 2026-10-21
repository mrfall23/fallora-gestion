// Outils de recherche partages (espace vendeuse).

// Meme regle que prive.normaliser_tel() en base : chiffres seuls, prefixe 00
// retire, indicatif 237 retire devant un numero local a 9 chiffres. Ainsi
// « 677 12 34 56 » et « +237677123456 » designent la meme cliente.
export function normaliserTel(tel: string | null | undefined): string {
  let d = (tel || '').replace(/[^0-9]/g, '').replace(/^00/, '');
  if (d.startsWith('237') && d.length === 12) d = d.slice(3);
  return d;
}

// Minuscules sans accents, pour que « helene » trouve « Hélène ».
export function sansAccents(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
