import { MalType } from "./types";

export interface MalEnv {
  data: Map<string, MalType>;
  outer?: MalEnv;
}

export function malNewEnv(outer: MalEnv | undefined = undefined): MalEnv {
  return { data: new Map(), outer: outer };
}

export function malEnvSet(env: MalEnv, key: string, value: MalType): MalType {
  env.data.set(key, value);
  return value;
}

export function malEnvFind(env: MalEnv, key: string): MalEnv | undefined {
  if (env.data.has(key)) {
    return env;
  }
  if (env.outer !== undefined) {
    return malEnvFind(env.outer, key);
  }
  return undefined;
}

export function malEnvGet(env: MalEnv, key: string): MalType | undefined {
  return malEnvFind(env, key)?.data.get(key);
}
