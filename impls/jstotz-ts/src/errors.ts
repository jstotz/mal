import { combine, err, ok, Result } from "neverthrow";
import { MalType } from "./types";

export type MalError =
  | { message: string; type: "unexpected_token"; token: string }
  | { message: string; type: "unexpected_eof" }
  | { message: string; type: "invalid_hash_map" }
  | { message: string; type: "symbol_not_found" }
  | { message: string; type: "type_error" }
  | { message: string; type: "runtime_error" };

export function malUnwrap<
  T extends MalType["type"],
  Value = Extract<MalType, { type: T }>["value"]
>(type: T, ast: MalType): Result<Value, MalError> {
  if (ast.type !== type)
    return err({
      type: "type_error",
      message: `Expected type ${type}, got ${ast.type}`,
    });
  return ok((ast.value as unknown) as Value);
}

export function malUnwrapSeq(ast: MalType): Result<MalType[], MalError> {
  if (!Array.isArray(ast.value))
    return err({
      type: "type_error",
      message: `Expected sequence, got ${ast.type}`,
    });
  return ok(ast.value);
}

export function malUnwrapAll<
  T extends MalType["type"],
  Value = Extract<MalType, { type: T }>["value"]
>(type: T, ast: MalType[]): Result<Value[], MalError> {
  return combine(ast.map((v) => malUnwrap<T, Value>(type, v)));
}

export function malUnwrapAllSeq(ast: MalType[]): Result<MalType[][], MalError> {
  return combine(ast.map((v) => malUnwrapSeq(v)));
}
