import { getActiveMarkets, getMarketVolumes } from "@/services/prediction-service";
import { MarketGrid } from "@/components/market/market-grid";

export const revalidate = 60;

export default async function HomePage() {
  const [markets, volumes] = await Promise.all([
    getActiveMarkets(),
    getMarketVolumes(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {/* <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Prediction Markets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {markets.length} active market{markets.length !== 1 ? "s" : ""}
        </p>
      </div> */}
      {markets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-5xl">🐙</span>
          <p className="text-muted-foreground">No active markets right now.</p>
        </div>
      ) : (
        <MarketGrid markets={markets} volumes={volumes} />
      )}
    </div>
  );
}
