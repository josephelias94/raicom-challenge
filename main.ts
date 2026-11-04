import { loadData, routeAll } from "./router.ts";

for (const line of routeAll(loadData())) console.log(line);
