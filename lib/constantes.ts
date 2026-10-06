// Seuil d'alerte de stock bas, partage par le tableau de bord, la page produits
// et la notification push de reapprovisionnement. Un produit dont le stock
// restant est <= a ce seuil est considere « a reapprovisionner ». Source unique
// pour eviter que les differents ecrans divergent.
export const SEUIL_STOCK_BAS = 5;
