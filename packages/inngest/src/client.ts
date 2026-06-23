import { Inngest, EventSchemas } from "inngest";
import type { ShipflowEvents } from "./events";

export const inngest = new Inngest({
  id: "shipflow",
  eventKey: process.env.INNGEST_EVENT_KEY,
  schemas: new EventSchemas().fromRecord<ShipflowEvents>(),
});

export type { ShipflowEvents } from "./events";
