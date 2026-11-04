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

- **Crashes with a generic `TypeError`:** an unknown SKU, an edit for an order that doesn't exist, a warehouse missing from `zones.json`, or an order with no `shipTo`.
- **No error, possibly wrong result:**
  - A duplicate order number drops the first order.
  - An unknown event type, such as a cancellation, is ignored.
  - A prefix missing at only one warehouse prints `zone undefined` or skips the zone comparison.
  - Zero velocity on an enabled warehouse gives it infinite cover, and a missing velocity skips the cover comparison.
  - A warehouse with no `available` value is skipped.
  - A negative quantity adds stock, a zero quantity or an order with no lines still routes, and a missing quantity goes to PARTNER.
  - A missing timestamp sorts the order last.
  - A warehouse not in the priority list wins a full tie.
- **Goes to PARTNER with a visible reason:** a lowercase country or a ZIP stored as a short string, such as `"2134"`.

If this ran in production, I'd add one validation step that throws a specific error before any order is routed.

**Unknown SKUs.** Read literally, rules 3 and 7 send an unknown SKU to PARTNER, because no warehouse has stock of it. The script crashes instead, so a data error can't ship unnoticed.

**30-minute edit window.** It isn't enforced, so an edit is merged whenever it arrives. The only edit in this data came 18 minutes after its order.

**Rules this data never reaches.** Rule 6, rule 7, and the "smallest" part of rule 5 are covered only by unit tests with synthetic orders.

**Ops notes.** `routes.txt` applies the rules to the files as given, so it ignores the ops notes. For example, it still routes five orders to WH-NV.

**Editor types.** The project has no `@types/node`, to stay free of dependencies, so type checking can report `node:` imports as missing. This doesn't affect running the script.
