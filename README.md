# Order router

Routes each order in `data/orders.json` to one warehouse, or to PARTNER, using the rules in `INSTRUCTIONS.md`. It prints one line per order: the order number, the destination, and the zone or reason.

## Usage

Requires Node with built-in TypeScript support (tested on v26.7.0). There are no packages to install. Run these from the project root, because the script reads `data/` relative to the current directory.

```sh
node main.ts                 # print the routes
node main.ts > routes.txt    # regenerate routes.txt
node --test                  # run the tests
```

Example output:

```
#2031 WH-NJ zone 1
#2033 WH-NJ zone 3 (normalized ZIP 2134 -> 02134)
#2037 PARTNER outside US
```

## Files

| File | Purpose |
| --- | --- |
| `main.ts` | Entry point: loads the data and prints the routes |
| `router.ts` | The routing rules |
| `orders.ts` | Turns events into clean orders: edits, ZIPs, SKUs, bundles |
| `types.ts` | Shared types |
| `router.test.ts` | Tests |
| `routes.txt` | Output for the data as given |
| `data/` | Input files and ops notes |
| `ai-conversations/` | Exported AI conversations |

## Data handling

Each of these is reported on the order's line in `routes.txt`.

| Order | Oddity | Handling |
| --- | --- | --- |
| #2033 | Numeric ZIP `2134` | Padded to `02134` |
| #2039 | ZIP+4 `07030-1834` | Uses the first three digits |
| #2040, #2056 | Bundle SKU | Expanded into its components for stock and cover |
| #2041 | Edited after creation | Edit merged; keeps its creation position in the queue |
| #2045 | Lowercase SKU | Uppercased |
| #2037 | Canadian order with a postal code | PARTNER (rule 1); the postal code is not treated as a ZIP |
| #2042 | Prefix 968 (HI) isn't in `zones.json` | PARTNER (rule 2) |
| #2046 | Empty ZIP, though the state is NJ | PARTNER (rule 2); the ZIP is not inferred from the state |

Days of cover uses available stock before the order reserves its own units.

## Known limitations

**No input validation.** I skipped it on purpose, because the brief says rough is fine and it keeps the code smaller to review. None of these cases occurs in this data, but a bad file would behave like this:

- **Crashes with a generic `TypeError`:** an edit for an order that doesn't exist, a warehouse missing from `zones.json`, an order with no `shipTo`, an order with no `lines` key, or an order with no timestamp, unless it's first in the file, in which case it sorts last with no error. A crash prints nothing, so all routes are lost.
- **No error, possibly wrong result:**
  - A duplicate order number drops the first order.
  - An unknown event type, such as a cancellation, is ignored.
  - A prefix missing at only one warehouse prints `zone undefined` or skips the zone comparison.
  - Zero velocity on an enabled warehouse gives it infinite cover, and a missing velocity skips the cover comparison.
  - A warehouse with no `available` value is skipped.
  - A negative quantity adds stock, a zero quantity or an order with an empty `lines` list still routes, and a missing quantity goes to PARTNER.
  - A warehouse not in the priority list wins a full tie.
- **Goes to PARTNER with a visible reason:** a lowercase country or a ZIP stored as a short string, such as `"2134"`.

If this ran in production, I'd add one validation step that throws a specific error before any order is routed.

**Unknown SKUs.** A SKU missing from a warehouse counts as 0 stock (rule 3). If no warehouse can take the order, it goes to PARTNER (rule 7), so a truly unknown product shows up only as the generic reason `no warehouse can take order`.

**Edits.** The router treats `orders.json` as final. At the file's last event (14:15:37), ten orders (#2047–#2056) are still inside their 30-minute edit window, so a later edit to one of them would be missed. The window also isn't enforced: a late edit is merged with the normal note and no lateness flag. The only edit in this data came 18 minutes after its order.

**Zero velocity.** WH-TX is the only warehouse with zero velocity, and it's disabled, so this doesn't happen today. If it were enabled, it would get infinite cover and win zone ties, such as #2034 and #2048. That's an undefined side effect, not a decision.

**Rules this data never reaches.** Rule 6, rule 7, and the "smallest" part of rule 5 are covered only by unit tests with synthetic orders.

**Ops notes.** `routes.txt` applies the rules to the files as given, so it ignores the ops notes. For example, it still routes five orders to WH-NV.

**Editor types.** The project has no `@types/node`, to stay free of dependencies, so type checking can report Node's built-in modules and globals as missing. This doesn't affect running the script.

## Part B answers

These come from running the router on scratch copies of the data, so they don't affect `routes.txt`.

### Question 1: where each order ships today

I ran the router with WH-NV off, because the ops notes say nothing can ship from there. WH-GA stays on, because its delay affects speed, not where an order can ship. The brief says not to apply "question 4" here, but it has no question 4, so I read that as Question 2.

| Order | Ships from | Why |
| --- | --- | --- |
| #2033 | WH-NJ | Lowest zone, once the ZIP is padded |
| #2037 | Partner warehouse | Ships to Canada (rule 1) |
| #2040 | WH-GA | The bundle needs magnesium, and WH-NJ has none left after #2039 |
| #2041 | WH-GA | With the edit it needs multivitamin, which WH-NV doesn't have anyway; WH-GA zone 7 beats WH-NJ zone 8 |
| #2045 | WH-GA | Lowest zone, once the SKU is uppercased |
| #2050 | WH-NJ | WH-GA has 1 vitamin D left and the order needs 2 |
| #2051 | WH-GA | WH-NV is down; WH-GA zone 7 beats WH-NJ zone 8. This is the only one that differs from `routes.txt`. |

No holds. #2051 is the closest candidate: it takes WH-GA's last vitamin D, which sends #2056 to PARTNER. Avoiding that would rely on hindsight, because #2056 came 14 minutes later and orders route in creation order.

### Question 2: what to ship

**Route away from WH-GA only when another warehouse is within one zone of it.** This depends on the following:

- WH-NV is turned off in the router first. It's still enabled, so today it receives 5 orders it can't ship.
- Operations confirms WH-NJ can take the extra volume, about 126 orders a day on Priya's figures. No file gives a capacity figure.
- The rule checks stock. If it doesn't, 4 to 6 of today's orders end up at PARTNER, depending on how it's read.
- The rule can be tested safely and is removed by hand on Monday, because the router has no clock.

If those can't be met, keep routing to WH-GA as normal.

| Option | Parcel cost per day (Priya's figures) | Today's 26 orders, WH-NV off |
| --- | --- | --- |
| Keep routing as normal | $0 | 15 at WH-GA, 4 at PARTNER |
| **Route away within one zone** | **$50.40** | 12 at WH-GA, 3 at PARTNER |
| Turn WH-GA off | $741.30 | 0 at WH-GA, 11 at PARTNER |
| Turn WH-GA off, turn WH-NV on | Not possible | WH-NV can't ship, and it's already enabled |

- **Why not turn WH-GA off:** with WH-NV down, WH-NJ has only 2 magnesium, so 8 US orders go to PARTNER on today's stock. For the 70% group, 2 days saved on picking become 2 more days in transit at $2.35 more per parcel, so they pay more and arrive no sooner.
- **Why route away:** the 30% group saves about 1.5 days for $0.40 per parcel.
- **The weak spot:** route-away vs. keeping WH-GA as normal is a close call. Route-away adds temporary logic, still leaves about 70% of WH-GA's orders waiting, and has knock-on effects. On today's orders, #2039 moves from WH-NJ zone 1 to WH-GA zone 5 because #2034 takes WH-NJ's magnesium.

### What I couldn't check

These come from the ops notes, and nothing in the data can confirm them:

- WH-NV can't ship, and WH-GA is about 2 business days behind.
- WH-GA ships about 420 orders a day. Its velocities total only 70 units a day, and it holds 454 units.
- Priya's 70/30 split and her transit and cost figures. On today's orders with WH-NV off, 10 WH-GA orders have WH-NJ within one zone, but only 6 can move, because WH-NJ runs out of magnesium.
- Whether 2 business days of picking equals 2 days in transit.

### Questions to raise

- **Priya:** Where does 420 orders a day come from? Which warehouses does the 30% assume, and does it check stock?
- **Marco:** Can WH-NJ absorb the volume? Will WH-GA's magnesium last until Monday? It's about 3.5 days at current velocities, with no restock.
- **Sean:** Why is WH-TX off? It has 500 of each product, but zero velocity gives it undefined cover, so that would need defining before it's turned on.

## AI conversations

I used two Claude Code sessions:

- [`main-runner.txt`](ai-conversations/main-runner.txt): built the solution and prepared the Part B analysis.
- [`auditor-overseer.txt`](ai-conversations/auditor-overseer.txt): reviewed that work independently and sent its findings to the first session.
