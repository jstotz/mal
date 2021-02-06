import { Result } from "neverthrow";
import { MalEnv } from "./env";
import { MalError } from "./errors";

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

export type MalFunctionValue = (
  ...args: MalType[]
) => Result<MalType, MalError>;

export type MalFunction = {
  type: "function";
  value: MalFunctionValue;
};

export interface MalFunctionDefValue {
  body: MalType;
  env: MalEnv;
  paramNames: string[];
  function: MalFunction;
}

export type MalFunctionDef = {
  type: "function_def";
  value: MalFunctionDefValue;
};

export type MalType = MalList | MalAtom;
export type MalAtom =
  | MalFunction
  | MalFunctionDef
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

export function malFunction(value: MalFunctionValue): MalFunction {
  return { type: "function", value };
}

export function malIsSeq(value: MalType): value is MalList | MalVector {
  return value.type === "list" || value.type === "vector";
}

const MAL_NIL: MalNil = { type: "nil", value: null };

export function malNil(): MalNil {
  return MAL_NIL;
}

export function malList(value: MalType[]): MalList {
  return { type: "list", value };
}

export function malBoolean(value: boolean): MalBoolean {
  return { type: "boolean", value };
}

export function malString(value: string): MalString {
  return { type: "string", value };
}

export function malEqual(a: MalType, b: MalType): boolean {
  if (malIsSeq(a) && malIsSeq(b)) {
    if (a.value.length !== b.value.length) {
      return false;
    }
    return a.value.every((element, i) => malEqual(element, b.value[i]));
  }
  return a.type === b.type && a.value === b.value;
}
