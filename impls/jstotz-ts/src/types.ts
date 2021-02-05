import { Result } from "neverthrow";

export interface MalNumber {
  type: "number";
  value: number;
}

export interface MalSymbol {
  type: "symbol";
  value: string;
}

export interface MalString {
  type: "string";
  value: string;
}

export interface MalList {
  type: "list";
  value: MalType[];
}

export interface MalKeyword {
  type: "keyword";
  value: string;
}

export interface MalNil {
  type: "nil";
  value: null;
}

export interface MalBoolean {
  type: "boolean";
  value: boolean;
}

export interface MalHashMap {
  type: "hash_map";
  value: Map<string, MalType>;
}

export interface MalVector {
  type: "vector";
  value: MalType[];
}

export type MalFunction = {
  type: "function";
  value: (...args: MalType[]) => Result<MalType, MalError>;
};

export type MalType = MalList | MalAtom;
export type MalAtom =
  | MalFunction
  | MalNumber
  | MalSymbol
  | MalString
  | MalKeyword
  | MalNil
  | MalBoolean
  | MalHashMap
  | MalVector;

export function malNumber(value: number): MalNumber {
  return { type: "number", value };
}

export function malFunction(
  value: (...args: MalType[]) => Result<MalType, MalError>
): MalFunction {
  return { type: "function", value };
}

export type MalError =
  | { message: string; type: "unexpected_token"; token: string }
  | { message: string; type: "unexpected_eof" }
  | { message: string; type: "invalid_hash_map" }
  | { message: string; type: "symbol_not_found" }
  | { message: string; type: "type_error" };
