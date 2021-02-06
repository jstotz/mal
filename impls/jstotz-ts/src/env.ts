import { malList, malNil, MalType } from "./types";

export interface MalEnv {
  data: Map<string, MalType>;
  outer?: MalEnv;
}

export function malNewEnv(
  outer: MalEnv | undefined = undefined,
  bindingKeys: string[] = [],
  exprs: MalType[] = []
): MalEnv {
  const env = { data: new Map(), outer: outer };
  for (let i = 0; i < bindingKeys.length; i++) {
    let key = bindingKeys[i];
    if (key === "&") {
      key = bindingKeys[i + 1];
      env.data.set(key, malList(exprs.slice(i)));
      break;
    }
    env.data.set(key, exprs[i] ?? malNil());
  }
  return env;
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
