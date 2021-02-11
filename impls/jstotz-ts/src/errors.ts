import { MalType } from "./types";

export type MalError =
  | { message: string; type: "unexpected_token"; token: string }
  | { message: string; type: "unexpected_eof" }
  | { message: string; type: "invalid_hash_map" }
  | { message: string; type: "symbol_not_found" }
  | { message: string; type: "type_error" }
  | { message: string; type: "exception"; data: MalType };

// Backwards compatibility for earlier steps
export {
  malException,
  malUnwrap,
  malUnwrapAll,
  malUnwrapAllSeq,
  malUnwrapSeq,
} from "./types";
