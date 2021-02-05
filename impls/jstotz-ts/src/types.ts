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

export type MalType = MalList | MalAtom;
export type MalAtom =
  | MalNumber
  | MalSymbol
  | MalString
  | MalKeyword
  | MalNil
  | MalBoolean
  | MalHashMap
  | MalVector;
