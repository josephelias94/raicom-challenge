import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, routeAll, type Data, type Line, type Warehouse } from "./route.ts";

const VITD = "NW-VITD-60";
const MULTI = "NW-MULTI-30";
const MAG = "NW-MAG-90";
const BUNDLE = "NW-BNDL-ESS";

const line = (sku: string, quantity = 1): Line => ({ sku, quantity });

// Prefix 111 ties all four warehouses. Prefix 333 is closest at WH-NV.
const ZONES = {
  "WH-NJ": { "111": 1, "333": 3 },
  "WH-GA": { "111": 1, "333": 2 },
  "WH-NV": { "111": 1, "333": 1 },
  "WH-TX": { "111": 1, "333": 4 },
};

function warehouse(code: string, available: Record<string, number>, enabled = true): Warehouse {
  const inventory = Object.fromEntries(
    Object.entries(available).map(([sku, units]) => [sku, { available: units, dailyVelocity: 10 }]),
  );
  return { code, enabled, inventory };
}

function created(orderNumber: string, lines: Line[], zip: string | number | undefined = "11101", country = "US", minute = 0) {
  const at = `2026-10-20T13:${String(minute).padStart(2, "0")}:00.000Z`;
  return { type: "order_created", orderNumber, at, shipTo: { country, zip }, lines };
}

function run(warehouses: Warehouse[], events: any[]): string[] {
  const data: Data = {
    events,
    warehouses,
    zones: ZONES,
    bundles: [{ sku: BUNDLE, components: [line(VITD), line(MAG)] }],
  };
  return routeAll(data);
}

const single = (warehouses: Warehouse[], order: any) => run(warehouses, [order])[0];

test("real data: all 26 orders match the hand-derived routes", () => {
  const expected = [
    "#2031 WH-NJ zone 1",
    "#2032 WH-GA zone 1",
    "#2033 WH-NJ zone 3",
    "#2034 WH-GA zone 5",
    "#2035 WH-GA zone 4",
    "#2036 WH-NV zone 2",
    "#2037 PARTNER",
    "#2038 WH-NV zone 4",
    "#2039 WH-NJ zone 1",
    "#2040 WH-GA zone 5",
    "#2041 WH-GA zone 7",
    "#2042 PARTNER",
    "#2043 WH-NV zone 3",
    "#2044 WH-GA zone 6",
    "#2045 WH-GA zone 3",
    "#2046 PARTNER",
    "#2047 WH-GA zone 4",
    "#2048 WH-NJ zone 5",
    "#2049 WH-GA zone 4",
    "#2050 WH-NJ zone 5",
    "#2051 WH-NV zone 2",
    "#2052 WH-NV zone 5",
    "#2053 WH-NJ zone 2",
    "#2054 WH-GA zone 4",
    "#2055 WH-GA zone 8",
    "#2056 WH-GA zone 5",
  ];
  const routes = routeAll(loadData()).map((l) => l.match(/^#\d+ (WH-[A-Z]+ zone \d+|PARTNER)/)![0]);
  assert.deepEqual(routes, expected);
});

test("real data: stock left after all orders matches the hand-derived totals", () => {
  const data = loadData();
  routeAll(data);
  const left = Object.fromEntries(
    data.warehouses.map((w) => [
      w.code,
      [w.inventory[VITD].available, w.inventory[MULTI].available, w.inventory[MAG].available],
    ]),
  );
  assert.deepEqual(left, {
    "WH-NJ": [395, 119, 0],
    "WH-GA": [0, 293, 144],
    "WH-NV": [198, 0, 216],
    "WH-TX": [500, 500, 500],
  });
});

test("real data: every normalized order is reported on its line", () => {
  const routes = routeAll(loadData());
  const noted = routes.filter((l) => l.includes("(")).map((l) => l.split(" ")[0]);
  assert.deepEqual(noted, ["#2033", "#2039", "#2040", "#2041", "#2045", "#2056"]);
});

test("rule 1: a non-US order goes to PARTNER even with a ZIP in zones", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 10 })];
  assert.equal(single(wh, created("#1", [line(VITD)], "11101", "CA")), "#1 PARTNER outside US");
});

test("rule 2: an empty or missing ZIP goes to PARTNER", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 10 })];
  assert.equal(single(wh, created("#1", [line(VITD)], "")), "#1 PARTNER no ZIP");
  const noZip = { ...created("#2", [line(VITD)]), shipTo: { country: "US" } };
  assert.equal(single(wh, noZip), "#2 PARTNER no ZIP");
});

test("rule 2: a prefix not in zones goes to PARTNER", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 10 })];
  assert.equal(single(wh, created("#1", [line(VITD)], "99999")), "#1 PARTNER ZIP prefix 999 not in zones");
});

test("ZIP: a numeric ZIP is padded, and the normalization is reported", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 10 })];
  const result = single(wh, { ...created("#1", [line(VITD)]), shipTo: { country: "US", zip: 11101 } });
  assert.equal(result, "#1 WH-NJ zone 1 (normalized ZIP 11101 -> 11101)");
  const zones = { ...ZONES, "WH-NJ": { ...ZONES["WH-NJ"], "021": 3 } };
  const data: Data = {
    events: [created("#2", [line(VITD)], 2134)],
    warehouses: [warehouse("WH-NJ", { [VITD]: 10 })],
    zones,
    bundles: [],
  };
  assert.deepEqual(routeAll(data), ["#2 WH-NJ zone 3 (normalized ZIP 2134 -> 02134)"]);
});

test("ZIP: ZIP+4 uses the first three digits and is reported", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 10 })];
  assert.equal(
    single(wh, created("#1", [line(VITD)], "11101-1834")),
    "#1 WH-NJ zone 1 (normalized ZIP 11101-1834 -> prefix 111)",
  );
});

test("rule 3: a disabled warehouse is skipped even when it is closest", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 10 }, false), warehouse("WH-GA", { [VITD]: 10 })];
  assert.equal(single(wh, created("#1", [line(VITD)], "33301")), "#1 WH-GA zone 2");
});

test("rule 3: a warehouse short on stock is skipped, and exact stock is enough", () => {
  const short = [warehouse("WH-NV", { [VITD]: 1 }), warehouse("WH-GA", { [VITD]: 10 })];
  assert.equal(single(short, created("#1", [line(VITD, 2)], "33301")), "#1 WH-GA zone 2");
  const exact = [warehouse("WH-NV", { [VITD]: 2 }), warehouse("WH-GA", { [VITD]: 10 })];
  assert.equal(single(exact, created("#2", [line(VITD, 2)], "33301")), "#2 WH-NV zone 1");
});

test("rule 3: an order is never split across warehouses", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 10, [MAG]: 0 }), warehouse("WH-GA", { [VITD]: 0, [MAG]: 10 })];
  assert.equal(
    single(wh, created("#1", [line(VITD), line(MAG)], "33301")),
    "#1 PARTNER no warehouse can take order",
  );
  assert.equal(wh[0].inventory[VITD].available, 10);
  assert.equal(wh[1].inventory[MAG].available, 10);
});

test("rule 4: the lowest zone wins regardless of cover and file order", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 500 }), warehouse("WH-GA", { [VITD]: 400 }), warehouse("WH-NV", { [VITD]: 1 })];
  assert.equal(single(wh, created("#1", [line(VITD)], "33301")), "#1 WH-NV zone 1");
});

test("rule 5: a zone tie goes to the most days of cover over priority", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 10 }), warehouse("WH-GA", { [VITD]: 20 })];
  assert.equal(single(wh, created("#1", [line(VITD)])), "#1 WH-GA zone 1");
});

test("rule 5: an order's cover is its smallest product cover", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 100, [MAG]: 20 }), warehouse("WH-GA", { [VITD]: 50, [MAG]: 50 })];
  assert.equal(single(wh, created("#1", [line(VITD), line(MAG)])), "#1 WH-GA zone 1");
});

test("rule 5: cover uses available stock before reserving this order", () => {
  const nj = warehouse("WH-NJ", {});
  nj.inventory[VITD] = { available: 15, dailyVelocity: 5 };
  const ga = warehouse("WH-GA", {});
  ga.inventory[VITD] = { available: 56, dailyVelocity: 20 };
  assert.equal(single([ga, nj], created("#1", [line(VITD, 10)])), "#1 WH-NJ zone 1");
});

test("rule 6: a full tie follows WH-NJ, WH-GA, WH-NV, WH-TX, not file order", () => {
  const all = ["WH-TX", "WH-NV", "WH-GA", "WH-NJ"];
  const inOrder = ["WH-NJ", "WH-GA", "WH-NV", "WH-TX"];
  inOrder.forEach((winner, i) => {
    const wh = all.filter((c) => inOrder.indexOf(c) >= i).map((c) => warehouse(c, { [VITD]: 10 }));
    assert.equal(single(wh, created("#1", [line(VITD)])), `#1 ${winner} zone 1`);
  });
});

test("rule 7: no eligible warehouse goes to PARTNER", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 1 })];
  assert.equal(single(wh, created("#1", [line(VITD, 2)])), "#1 PARTNER no warehouse can take order");
});

test("orders route by creation time, not file order", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 1 }), warehouse("WH-GA", { [VITD]: 10 })];
  const late = created("#late", [line(VITD)], "33301", "US", 30);
  const early = created("#early", [line(VITD)], "33301", "US", 10);
  assert.deepEqual(run(wh, [late, early]), ["#early WH-NV zone 1", "#late WH-GA zone 2"]);
});

test("a routed order reserves its stock for later orders", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 1 }), warehouse("WH-GA", { [VITD]: 10 })];
  const orders = [created("#1", [line(VITD)], "33301", "US", 0), created("#2", [line(VITD)], "33301", "US", 1)];
  assert.deepEqual(run(wh, orders), ["#1 WH-NV zone 1", "#2 WH-GA zone 2"]);
  assert.equal(wh[0].inventory[VITD].available, 0);
  assert.equal(wh[1].inventory[VITD].available, 9);
});

test("PARTNER orders reserve no warehouse stock", () => {
  const wh = [warehouse("WH-NJ", { [VITD]: 1 })];
  const orders = [created("#1", [line(VITD)], "11101", "CA", 0), created("#2", [line(VITD)], "11101", "US", 1)];
  assert.deepEqual(run(wh, orders), ["#1 PARTNER outside US", "#2 WH-NJ zone 1"]);
});

test("an edit is merged before routing, and the order routes once", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 10, [MULTI]: 0 }), warehouse("WH-GA", { [VITD]: 10, [MULTI]: 10 })];
  const edit = { type: "order_edited", orderNumber: "#1", at: "2026-10-20T13:18:00.000Z", addedLines: [line(MULTI)] };
  assert.deepEqual(run(wh, [created("#1", [line(VITD)], "33301"), edit]), [
    `#1 WH-GA zone 2 (merged edit: added ${MULTI} x1)`,
  ]);
});

test("an edited order keeps its creation position in the queue", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 1, [MULTI]: 1 }), warehouse("WH-GA", { [VITD]: 10, [MULTI]: 10 })];
  const edit = { type: "order_edited", orderNumber: "#1", at: "2026-10-20T13:18:00.000Z", addedLines: [line(MULTI)] };
  const events = [
    created("#1", [line(VITD)], "33301", "US", 0),
    created("#2", [line(VITD)], "33301", "US", 10),
    edit,
  ];
  assert.deepEqual(run(wh, events), [
    `#1 WH-NV zone 1 (merged edit: added ${MULTI} x1)`,
    "#2 WH-GA zone 2",
  ]);
});

test("the same SKU from an edit is summed before checking stock", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 1 }), warehouse("WH-GA", { [VITD]: 10 })];
  const edit = { type: "order_edited", orderNumber: "#1", at: "2026-10-20T13:18:00.000Z", addedLines: [line(VITD)] };
  assert.deepEqual(run(wh, [created("#1", [line(VITD)], "33301"), edit]), [
    `#1 WH-GA zone 2 (merged edit: added ${VITD} x1)`,
  ]);
});

test("a bundle expands into components, multiplied by quantity, and is reported", () => {
  const wh = [warehouse("WH-NV", { [VITD]: 1, [MAG]: 1 }), warehouse("WH-GA", { [VITD]: 10, [MAG]: 10 })];
  assert.equal(
    single(wh, created("#1", [line(BUNDLE, 2)], "33301")),
    `#1 WH-GA zone 2 (expanded bundle ${BUNDLE})`,
  );
  assert.equal(wh[1].inventory[VITD].available, 8);
  assert.equal(wh[1].inventory[MAG].available, 8);
});

test("a lowercase SKU is normalized and reported", () => {
  const wh = [warehouse("WH-NJ", { [MAG]: 1 })];
  assert.equal(
    single(wh, created("#1", [line("nw-mag-90")])),
    `#1 WH-NJ zone 1 (normalized SKU nw-mag-90 -> ${MAG})`,
  );
});
