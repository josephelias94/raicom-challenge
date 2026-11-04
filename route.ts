import { readFileSync } from "node:fs";

export type Line = { sku: string; quantity: number };
export type Stock = { available: number; dailyVelocity: number };
export type Warehouse = { code: string; enabled: boolean; inventory: Record<string, Stock> };
export type Order = {
  orderNumber: string;
  at: string;
  shipTo: { country: string; zip?: string | number };
  lines: Line[];
  notes: string[];
};
export type Data = {
  events: any[];
  warehouses: Warehouse[];
  zones: Record<string, Record<string, number>>;
  bundles: { sku: string; components: Line[] }[];
};

const PRIORITY = ["WH-NJ", "WH-GA", "WH-NV", "WH-TX"];

export function loadData(): Data {
  const read = (file: string) => JSON.parse(readFileSync(`data/${file}`, "utf8"));
  return {
    events: read("orders.json"),
    warehouses: read("warehouses.json"),
    zones: read("zones.json"),
    bundles: read("catalog.json").bundles,
  };
}

export function loadOrders(events: any[]): Order[] {
  const orders = new Map<string, Order>();
  for (const event of events.filter((e) => e.type === "order_created")) {
    orders.set(event.orderNumber, { ...event, lines: [...event.lines], notes: [] });
  }
  for (const event of events.filter((e) => e.type === "order_edited")) {
    const order = orders.get(event.orderNumber)!;
    order.lines.push(...event.addedLines);
    for (const line of event.addedLines) {
      order.notes.push(`merged edit: added ${line.sku} x${line.quantity}`);
    }
  }
  return [...orders.values()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function zipPrefix(order: Order): string {
  const zip = order.shipTo.zip ?? "";
  if (typeof zip === "number") {
    const padded = String(zip).padStart(5, "0");
    order.notes.push(`normalized ZIP ${zip} -> ${padded}`);
    return padded.slice(0, 3);
  }
  if (zip.length > 5) order.notes.push(`normalized ZIP ${zip} -> prefix ${zip.slice(0, 3)}`);
  return zip.slice(0, 3);
}

function unitsNeeded(order: Order, bundles: Data["bundles"]): Map<string, number> {
  const units = new Map<string, number>();
  const add = (sku: string, quantity: number) => units.set(sku, (units.get(sku) ?? 0) + quantity);
  for (const line of order.lines) {
    const sku = line.sku.toUpperCase();
    if (sku !== line.sku) order.notes.push(`normalized SKU ${line.sku} -> ${sku}`);
    const bundle = bundles.find((b) => b.sku === sku);
    if (bundle) {
      order.notes.push(`expanded bundle ${sku}`);
      for (const part of bundle.components) add(part.sku, part.quantity * line.quantity);
    } else {
      add(sku, line.quantity);
    }
  }
  return units;
}

function route(order: Order, { warehouses, zones, bundles }: Data): string {
  if (order.shipTo.country !== "US") return "PARTNER outside US";

  const prefix = zipPrefix(order);
  if (!prefix) return "PARTNER no ZIP";
  if (!(prefix in zones["WH-NJ"])) return `PARTNER ZIP prefix ${prefix} not in zones`;

  const units = [...unitsNeeded(order, bundles)];
  const cover = (w: Warehouse) =>
    Math.min(...units.map(([sku]) => w.inventory[sku].available / w.inventory[sku].dailyVelocity));

  const [chosen] = warehouses
    .filter((w) => w.enabled && units.every(([sku, qty]) => w.inventory[sku].available >= qty))
    .sort(
      (a, b) =>
        zones[a.code][prefix] - zones[b.code][prefix] ||
        cover(b) - cover(a) ||
        PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code),
    );
  if (!chosen) return "PARTNER no warehouse can take order";

  for (const [sku, qty] of units) chosen.inventory[sku].available -= qty;
  return `${chosen.code} zone ${zones[chosen.code][prefix]}`;
}

export function routeAll(data: Data): string[] {
  return loadOrders(data.events).map((order) => {
    const result = route(order, data);
    const notes = order.notes.length ? ` (${order.notes.join("; ")})` : "";
    return `${order.orderNumber} ${result}${notes}`;
  });
}

if (import.meta.main) {
  for (const line of routeAll(loadData())) console.log(line);
}
