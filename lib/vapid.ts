// Cle publique VAPID — NON secrete par nature (elle est de toute facon envoyee
// au navigateur pour s'abonner aux notifications). On peut donc l'ecrire en dur :
// ca evite une variable d'environnement cote build. Seule la cle PRIVEE
// (VAPID_PRIVATE_KEY) reste un secret, cote serveur uniquement.
export const VAPID_PUBLIC_KEY =
  'BOQ4fgDjVYXcKwl-Rm8sZ6xwNfqzEnVYQLoi-fIxAJN4iJW8pvMLqoOqaabLGAxUv0k-OKKJkv8bGlxgK-Ly3Gc';
