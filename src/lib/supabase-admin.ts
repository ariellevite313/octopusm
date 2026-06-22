/**
 * supabase-admin.ts
 *
 * Utilitaire pour appeler les Edge Functions admin depuis le client.
 * Les Edge Functions utilisent service_role et vérifient le wallet admin
 * côté serveur via la variable d'environnement ADMIN_WALLET_ADDRESS.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Appelle une Edge Function admin.
 * Injecte le wallet dans le header x-admin-wallet pour vérification serveur.
 */
export async function callAdminFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  adminWallet: string
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/${functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
          "x-admin-wallet": adminWallet,
        },
        body: JSON.stringify(body),
      }
    );

    const json = (await response.json()) as { success?: boolean; data?: T; error?: string };

    if (!response.ok || json.error) {
      return { success: false, error: json.error ?? `Erreur serveur (${response.status})` };
    }

    return { success: true, data: json.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur réseau";
    console.error(`[supabase-admin] ${functionName}:`, msg);
    return { success: false, error: msg };
  }
}
