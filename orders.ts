import type { Bundle, Line, Order, OrderEdited, OrderEvent, Units } from "./types.ts";

export function loadOrders(events: OrderEvent[]): Order[] {
  const orders = new Map<string, Order>();

  for (const event of events) {
    if (event.type === "order_created") {
      orders.set(event.orderNumber, { ...event, lines: [...event.lines], notes: [] });
    }
  }
  for (const event of events) {
    if (event.type === "order_edited") applyEdit(orders.get(event.orderNumber)!, event);
  }

  return [...orders.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function applyEdit(order: Order, edit: OrderEdited): void {
  order.lines.push(...edit.addedLines);
  for (const line of edit.addedLines) {
    order.notes.push(`merged edit: added ${line.sku} x${line.quantity}`);
  }
}

export function parseZip(zip: string | number | undefined): { prefix: string; notes: string[] } {
  if (typeof zip === "number") {
    const padded = String(zip).padStart(5, "0");
    return { prefix: padded.slice(0, 3), notes: [`normalized ZIP ${zip} -> ${padded}`] };
  }

  const text = zip ?? "";
  const prefix = text.slice(0, 3);
  const notes = text.length > 5 ? [`normalized ZIP ${text} -> prefix ${prefix}`] : [];
  return { prefix, notes };
}

export function unitsNeeded(lines: Line[], bundles: Bundle[]): { units: Units; notes: string[] } {
  const units: Units = new Map();
  const notes: string[] = [];

  for (const line of lines) {
    const sku = line.sku.toUpperCase();
    if (sku !== line.sku) notes.push(`normalized SKU ${line.sku} -> ${sku}`);

    const bundle = bundles.find((b) => b.sku === sku);
    if (bundle) notes.push(`expanded bundle ${sku}`);

    for (const part of bundle ? expandBundle(bundle, line.quantity) : [{ sku, quantity: line.quantity }]) {
      units.set(part.sku, (units.get(part.sku) ?? 0) + part.quantity);
    }
  }

  return { units, notes };
}

function expandBundle(bundle: Bundle, quantity: number): Line[] {
  return bundle.components.map((part) => ({ sku: part.sku, quantity: part.quantity * quantity }));
}
