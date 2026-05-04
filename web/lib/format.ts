/** Currency, badge, and other simple formatters used by the parts UI. */

export function formatPriceUsd(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: v >= 100 ? 0 : 2,
  });
}

export type StockBadge = {
  label: string;
  className: string;
};

export function stockBadge(stock: string | null): StockBadge {
  switch ((stock ?? "").toLowerCase()) {
    case "in_stock":
    case "in stock":
      return {
        label: "In stock",
        className:
          "bg-emerald-900/40 text-emerald-300 ring-1 ring-emerald-700/60",
      };
    case "out_of_stock":
    case "backorder":
      return {
        label: "Backorder",
        className:
          "bg-amber-900/40 text-amber-300 ring-1 ring-amber-700/60",
      };
    default:
      return {
        label: "Stock unknown",
        className:
          "bg-equipment-700/60 text-zinc-300 ring-1 ring-equipment-600",
      };
  }
}
