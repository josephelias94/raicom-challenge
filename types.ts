export type Line = { sku: string; quantity: number };

export type OrderCreated = {
  type: "order_created";
  orderNumber: string;
  at: string;
  shipTo: { country: string; zip?: string | number };
  lines: Line[];
};

export type OrderEdited = {
  type: "order_edited";
  orderNumber: string;
  at: string;
  addedLines: Line[];
};

export type OrderEvent = OrderCreated | OrderEdited;

export type Order = OrderCreated & { notes: string[] };

export type Stock = { available: number; dailyVelocity: number };

export type Warehouse = {
  code: string;
  enabled: boolean;
  inventory: Record<string, Stock>;
};

export type Bundle = { sku: string; components: Line[] };

export type Units = Map<string, number>;

export type Data = {
  events: OrderEvent[];
  warehouses: Warehouse[];
  zones: Record<string, Record<string, number>>;
  bundles: Bundle[];
};
