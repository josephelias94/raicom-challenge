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
