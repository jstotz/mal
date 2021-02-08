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

export interface MalList<T = MalType[]> {
  type: "list";
  value: T;
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
  isMacro: boolean;
};

export interface MalFunctionDefValue {
  body: MalType;
  env: MalEnv;
  paramNames: string[];
  function: MalFunction;
}

export interface MalFunctionDef {
  type: "function_def";
  value: MalFunctionDefValue;
}

export interface MalAtomRef {
  type: "atom_ref";
  value: MalType;
}

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
  | MalVector
  | MalAtomRef;

export function malNumber(value: number): MalNumber {
  return { type: "number", value };
}

export function malFunction(
  value: MalFunctionValue,
  { isMacro } = { isMacro: false }
): MalFunction {
  return { type: "function", value, isMacro };
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

export function malVector(value: MalType[]): MalVector {
  return { type: "vector", value };
}

export function malBoolean(value: boolean): MalBoolean {
  return { type: "boolean", value };
}

export function malString(value: string): MalString {
  return { type: "string", value };
}

export function malSymbol(value: string): MalSymbol {
  return { type: "symbol", value };
}

export function malAtomRef(value: MalType): MalAtomRef {
  return { type: "atom_ref", value };
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

export function malIsSymbolNamed(ast: MalType, name: string): boolean {
  return ast?.type === "symbol" && ast?.value === name;
}

export function malIsMacroFunction(
  ast?: MalType
): ast is MalFunction | MalFunctionDef {
  return ast?.type === "function_def"
    ? malIsMacroFunction(ast.value.function)
    : ast?.type === "function" && ast.isMacro;
}
