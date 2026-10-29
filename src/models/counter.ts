import { Schema } from "mongoose"
import { modelFor } from "./_shared"

/** Atomic sequence numbers (order numbers). `_id` names the sequence, for example "order:2610". */
export interface CounterDoc {
  _id: string
  seq: number
}
const schema = new Schema<CounterDoc>({ _id: String, seq: { type: Number, default: 0 } })
export const Counter = modelFor<CounterDoc>("Counter", schema)
