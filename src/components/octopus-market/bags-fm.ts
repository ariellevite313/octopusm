export const bagsFmEndpoint = "https://public-api-v2.bags.fm/api/v1/endpoint";
const bagsFmApiKey = "FhTZHYjqeQixNMKx8BddbAQ6PjQ4nLJnKsUfewnqPdHb";

export type BagsLaunchPayload = {
  tokenName: string;
  symbol: string;
  description: string;
  mintAddress: string;
  logoName: string;
  whitepaperName: string;
  projectXUrl: string;
  projectTelegramUrl: string;
  projectDiscordUrl: string;
  developerWallets: string[];
  lockWallet: string;
  walletAddress: string;
  launchOption: "free" | "standard";
  feeAmountUsdc: number;
  hasDiscount: boolean;
  initialBuyEnabled: boolean;
  initialBuyPercent: number;
};

export type BagsLaunchResult = {
  ok: boolean;
  requestId: string;
  launchUrl: string;
  birdEyeUrl: string;
  poolAddress: string;
  usedFallback: boolean;
};

export async function createBagsLaunchRequest(payload: BagsLaunchPayload): Promise<BagsLaunchResult> {
  const fallbackLaunchUrl = `https://bags.fm/token/${payload.mintAddress}`;
  const fallbackBirdEyeUrl = `https://birdeye.so/solana/token/${payload.mintAddress}`;
  const fallbackRequestId = `BAGS-${Date.now().toString(36).toUpperCase()}`;

  try {
    const response = await fetch(bagsFmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": bagsFmApiKey,
      },
      body: JSON.stringify(payload),
    });

    let parsed: unknown = null;

    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    const parsedRecord = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const requestId =
      typeof parsedRecord?.requestId === "string"
        ? parsedRecord.requestId
        : typeof parsedRecord?.id === "string"
          ? parsedRecord.id
          : fallbackRequestId;
    const launchUrl =
      typeof parsedRecord?.launchUrl === "string"
        ? parsedRecord.launchUrl
        : typeof parsedRecord?.url === "string"
          ? parsedRecord.url
          : fallbackLaunchUrl;
    const poolAddress =
      typeof parsedRecord?.poolAddress === "string"
        ? parsedRecord.poolAddress
        : typeof parsedRecord?.pool === "string"
          ? parsedRecord.pool
          : "";
    const birdEyeUrl =
      typeof parsedRecord?.birdEyeUrl === "string"
        ? parsedRecord.birdEyeUrl
        : typeof parsedRecord?.birdeyeUrl === "string"
          ? parsedRecord.birdeyeUrl
          : fallbackBirdEyeUrl;

    if (!response.ok) {
      return {
        ok: false,
        requestId,
        launchUrl,
        birdEyeUrl,
        poolAddress,
        usedFallback: true,
      };
    }

    return {
      ok: true,
      requestId,
      launchUrl,
      birdEyeUrl,
      poolAddress,
      usedFallback: false,
    };
  } catch {
    return {
      ok: false,
      requestId: fallbackRequestId,
      launchUrl: fallbackLaunchUrl,
      birdEyeUrl: fallbackBirdEyeUrl,
      poolAddress: "",
      usedFallback: true,
    };
  }
}
