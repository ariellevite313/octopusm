// Types minimaux pour bn.js (évite d'ajouter @types/bn.js ; les usages sont des constructions simples).
declare module "bn.js" {
  class BN {
    constructor(value: number | string | number[] | Uint8Array | Buffer | BN, base?: number | "hex", endian?: "le" | "be");
    toString(base?: number | "hex", length?: number): string;
    toNumber(): number;
    toArray(endian?: "le" | "be", length?: number): number[];
    toBuffer(endian?: "le" | "be", length?: number): Buffer;
    add(b: BN): BN; sub(b: BN): BN; mul(b: BN): BN; div(b: BN): BN; mod(b: BN): BN;
    cmp(b: BN): number; eq(b: BN): boolean; gt(b: BN): boolean; lt(b: BN): boolean; isZero(): boolean;
    [key: string]: any;
  }
  export default BN;
}
