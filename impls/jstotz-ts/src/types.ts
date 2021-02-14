import { combine, err, ok, Result } from "neverthrow";
import { MalEnv } from "./env";
import { MalError } from "./errors";

export const MAL_KEYWORD_PREFIX = "ʞ";

interface MalBaseType {
  metadata?: MalType;
}

export interface MalNumber extends MalBaseType {
  type: "number";
  value: number;
}

export interface MalSymbol extends MalBaseType {
  type: "symbol";
  value: string;
}

export interface MalString extends MalBaseType {
  type: "string";
  value: string;
}

export interface MalList<T = MalType[]> extends MalBaseType {
  type: "list";
  value: T;
}

export interface MalKeyword extends MalBaseType {
  type: "keyword";
  value: string;
}

export interface MalNil extends MalBaseType {
  type: "nil";
  value: null;
}

export interface MalBoolean extends MalBaseType {
  type: "boolean";
  value: boolean;
}

export interface MalHashMap extends MalBaseType {
  type: "hash_map";
  value: Map<string, MalType>;
}

export interface MalVector extends MalBaseType {
  type: "vector";
  value: MalType[];
}

export type MalFunctionValue = (
  ...args: MalType[]
) => Result<MalType, MalError>;

export interface MalFunction extends MalBaseType {
  type: "function";
  value: MalFunctionValue;
  isMacro: boolean;
}

export interface MalFunctionDefValue {
  body: MalType;
  env: MalEnv;
  paramNames: string[];
  function: MalFunction;
}

export interface MalFunctionDef extends MalBaseType {
  type: "function_def";
  value: MalFunctionDefValue;
}

export interface MalAtomRef extends MalBaseType {
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

export function malKeyword(value: string): MalKeyword {
  return {
    type: "keyword",
    value:
      value[0] === MAL_KEYWORD_PREFIX ? value : `${MAL_KEYWORD_PREFIX}${value}`,
  };
}

export function malHashMap(value: Map<string, MalType>): MalHashMap {
  return { type: "hash_map", value };
}

export function malAtomRef(value: MalType): MalAtomRef {
  return { type: "atom_ref", value };
}

export function malParseString(value: string): MalString | MalKeyword {
  const type = value[0] === MAL_KEYWORD_PREFIX ? "keyword" : "string";
  return { type, value };
}

export function malHashMapEntries(value: MalHashMap): MalList {
  return malList(
    Array.from(value.value.entries())
      .sort()
      .map(([k, v]) => malList([malParseString(k), v]))
  );
}

export function malEqual(a: MalType, b: MalType): boolean {
  if (malIsSeq(a) && malIsSeq(b)) {
    if (a.value.length !== b.value.length) {
      return false;
    }
    return a.value.every((element, i) => malEqual(element, b.value[i]));
  }
  if (a.type === "hash_map" && b.type === "hash_map") {
    return malEqual(malHashMapEntries(a), malHashMapEntries(b));
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

export function malIsFunction(
  ast?: MalType
): ast is MalFunction | MalFunctionDef {
  return malTypeIsOneOf(["function", "function_def"], ast);
}

export function malTypeIsOneOf(
  types: MalType["type"] | MalType["type"][],
  ast?: MalType
): boolean {
  if (ast === undefined) return false;
  return Array.isArray(types)
    ? types.some((t) => t === ast.type)
    : ast.type === types;
}

export function malStringIsKeyword(str: string): boolean {
  return str[0] === MAL_KEYWORD_PREFIX;
}

export function malUnwrap<
  T extends MalType["type"],
  Value = Extract<MalType, { type: T }>["value"]
>(type: T | T[], ast: MalType): Result<Value, MalError> {
  return malTypeIsOneOf(type, ast)
    ? ok((ast.value as unknown) as Value)
    : err({
        type: "type_error",
        message: `Expected type ${[type].flat().join(" | ")}, got ${ast.type}`,
      });
}

export function malUnwrapSeq(ast: MalType): Result<MalType[], MalError> {
  return malUnwrap(["list", "vector"], ast);
}

export function malUnwrapHashMapKey(ast: MalType): Result<string, MalError> {
  return malUnwrap(["string", "keyword"], ast);
}

export function malUnwrapAll<
  T extends MalType["type"],
  Value = Extract<MalType, { type: T }>["value"]
>(type: T | T[], ast: MalType[]): Result<Value[], MalError> {
  return combine(ast.map((v) => malUnwrap<T, Value>(type, v)));
}

export function malUnwrapAllSeq(ast: MalType[]): Result<MalType[][], MalError> {
  return combine(ast.map((v) => malUnwrapSeq(v)));
}

export function malException(
  data: MalType | string
): Extract<MalError, { type: "exception" }> {
  if (typeof data === "string") {
    data = malString(data);
  }
  return {
    type: "exception",
    message: "Runtime exception",
    data,
  };
}
