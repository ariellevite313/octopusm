/**
 * Marque « Chill ton sac » sur Arc, utilisable côté client et serveur.
 * Le navigateur ajoute 16 octets à la fin des données de la transaction du routeur (Solidity ignore les octets en trop).
 * Comme c'est le trader qui signe la transaction, la marque prouve que le trade vient bien de ce post : personne ne peut
 * réclamer après coup la transaction d'un autre.
 */
import { keccak256, toBytes } from "viem";

/** 16 octets en hex, sans « 0x ». */
export function arcChillTag(postId: string): string {
  return keccak256(toBytes(`om-chill:${postId.toLowerCase()}`)).slice(2, 34);
}
