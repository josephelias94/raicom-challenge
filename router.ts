import { readFileSync } from "node:fs";
import { loadOrders, parseZip, unitsNeeded } from "./orders.ts";
import type { Data, Order, Units, Warehouse } from "./types.ts";

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

export function routeAll(data: Data): string[] {
  return loadOrders(data.events).map((order) => {
    const result = route(order, data);
    const notes = order.notes.length ? ` (${order.notes.join("; ")})` : "";
    return `${order.orderNumber} ${result}${notes}`;
  });
}

function route(order: Order, data: Data): string {
  if (order.shipTo.country !== "US") return "PARTNER outside US";

  const { prefix, notes: zipNotes } = parseZip(order.shipTo.zip);
  order.notes.push(...zipNotes);
  if (!prefix) return "PARTNER no ZIP";
  if (!isKnownPrefix(prefix, data)) return `PARTNER ZIP prefix ${prefix} not in zones`;

  const { units, notes: unitNotes } = unitsNeeded(order.lines, data.bundles);
  order.notes.push(...unitNotes);

  const chosen = pickWarehouse(units, prefix, data);
  if (!chosen) return "PARTNER no warehouse can take order";

  reserve(chosen, units);
  return `${chosen.code} zone ${data.zones[chosen.code][prefix]}`;
}

function isKnownPrefix(prefix: string, { warehouses, zones }: Data): boolean {
  return warehouses.some((w) => prefix in zones[w.code]);
}

function pickWarehouse(units: Units, prefix: string, { warehouses, zones }: Data): Warehouse | undefined {
  const byZone = (a: Warehouse, b: Warehouse) => zones[a.code][prefix] - zones[b.code][prefix];
  const byCover = (a: Warehouse, b: Warehouse) => daysOfCover(b, units) - daysOfCover(a, units);
  const byPriority = (a: Warehouse, b: Warehouse) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code);

  return warehouses
    .filter((w) => canTake(w, units))
    .sort((a, b) => byZone(a, b) || byCover(a, b) || byPriority(a, b))[0];
}

function canTake(warehouse: Warehouse, units: Units): boolean {
  if (!warehouse.enabled) return false;
  return [...units].every(([sku, quantity]) => warehouse.inventory[sku].available >= quantity);
}

function daysOfCover(warehouse: Warehouse, units: Units): number {
  const covers = [...units.keys()].map((sku) => {
    const { available, dailyVelocity } = warehouse.inventory[sku];
    return available / dailyVelocity;
  });
  return Math.min(...covers);
}

function reserve(warehouse: Warehouse, units: Units): void {
  for (const [sku, quantity] of units) warehouse.inventory[sku].available -= quantity;
}
