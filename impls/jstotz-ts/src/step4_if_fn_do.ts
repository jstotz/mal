import { combine, err, ok, Result } from "neverthrow";
import readline from "readline";
import coreEnv from "./core";
import { MalEnv, malEnvGet, malEnvSet, malNewEnv } from "./env";
import { MalError, malUnwrap, malUnwrapAll } from "./errors";
import { debugForm, printForm } from "./printer";
import { readStr } from "./reader";
import {
  malFunction,
  MalFunction,
  malIsSeq,
  MalList,
  malNil,
  MalType,
} from "./types";

function read(input: string) {
  return readStr(input);
}

function malCall(
  malFn: MalType,
  ...args: MalType[]
): Result<MalType, MalError> {
  return malUnwrap("function", malFn).andThen((fn) => fn(...args));
}

function malEvalAst(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  switch (ast.type) {
    case "list":
    case "vector":
      return combine(ast.value.map((a) => malEval(a, env))).map((values) => ({
        type: ast.type,
        value: values,
      }));
    case "hash_map": {
      return combine(
        Array.from(ast.value).map(([key, value]) =>
          malEval(value, env).map((evaled) => ({ key, value: evaled }))
        )
      ).map((evaledPairs) => ({
        type: "hash_map",
        value: new Map<string, MalType>(
          evaledPairs.map((pair) => [pair.key, pair.value])
        ),
      }));
    }
    case "symbol": {
      const value = malEnvGet(env, ast.value);
      if (value === undefined) {
        return err({
          type: "symbol_not_found",
          message: `Symbol ${ast.value} not found`,
        });
      }
      return ok(value);
    }
    default:
      return ok(ast);
  }
}

function malEvalDef(list: MalList, env: MalEnv): Result<MalType, MalError> {
  const [, keySymbol, valueAst] = list.value;
  if (keySymbol?.type !== "symbol") {
    return err({ type: "type_error", message: "Expected symbol key in def!" });
  }
  if (valueAst === undefined) {
    return err({ type: "type_error", message: "Expected value in def!" });
  }
  return malEval(valueAst, env).andThen((evaled) =>
    ok(malEnvSet(env, keySymbol.value, evaled))
  );
}

function malEvalLet(
  list: MalList,
  outerEnv: MalEnv
): Result<MalType, MalError> {
  const letEnv = malNewEnv(outerEnv);
  const [, bindings, body] = list.value;
  if (bindings?.type !== "list" && bindings?.type !== "vector") {
    return err({
      type: "type_error",
      message: "Expected bindings to be a list or vector in let*",
    });
  }
  if (bindings.value.length % 2 !== 0) {
    return err({
      type: "type_error",
      message: "Binding list in let* has mismatched keys and values",
    });
  }
  if (body === undefined) {
    return err({
      type: "type_error",
      message: "Expected body in let*",
    });
  }
  for (let i = 0; i < bindings.value.length; i += 2) {
    const bindingKey = bindings.value[i];
    const bindingValue = bindings.value[i + 1];
    if (bindingKey.type !== "symbol") {
      return err({
        type: "type_error",
        message: `Expected let* binding key to be a symbol. Got: ${printForm(
          bindingKey
        )}`,
      });
    }
    const evaledBindingValue = malEval(bindingValue, letEnv);
    if (evaledBindingValue.isErr()) return evaledBindingValue;
    malEnvSet(letEnv, bindingKey.value, evaledBindingValue.value);
  }
  return malEval(body, letEnv);
}

function malEvalDo(list: MalList, env: MalEnv): Result<MalType, MalError> {
  for (let i = 1; i < list.value.length; i++) {
    const form = list.value[i];
    const evalResult = malEval(form, env);
    if (evalResult.isErr()) return evalResult;
    if (i === list.value.length - 1) {
      return ok(evalResult.value);
    }
  }
  return ok(malNil());
}

function malCastBoolean(ast: MalType): boolean {
  if (ast.type === "boolean") return ast.value;
  if (ast.type === "nil") return false;
  return true;
}

function malEvalIf(list: MalList, env: MalEnv): Result<MalType, MalError> {
  const [, cond, ifBody, elseBody] = list.value;
  if (ifBody === undefined) {
    return err({ type: "type_error", message: "if called without a body" });
  }
  const condResult = malEval(cond, env);
  if (condResult.isErr()) return condResult;
  if (malCastBoolean(condResult.value)) {
    return malEval(ifBody, env);
  } else {
    if (elseBody === undefined) {
      return ok(malNil());
    }
    return malEval(elseBody, env);
  }
}

function malEvalFn(
  list: MalList,
  outerEnv: MalEnv
): Result<MalFunction, MalError> {
  const [, bindings, body] = list.value;
  if (!malIsSeq(bindings)) {
    return err({
      type: "type_error",
      message: "function bindings must be a sequence",
    });
  }
  return malUnwrapAll("symbol", bindings.value).andThen((bindingKeys) =>
    ok(
      malFunction((...args) =>
        malEval(body, malNewEnv(outerEnv, bindingKeys, args))
      )
    )
  );
}

function malEval(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  if (ast.type !== "list") {
    return malEvalAst(ast, env);
  }

  if (ast.value.length === 0) return ok(ast);
  if (ast.value[0].type === "symbol") {
    switch (ast.value[0].value) {
      case "def!":
        return malEvalDef(ast, env);
      case "let*":
        return malEvalLet(ast, env);
      case "do":
        return malEvalDo(ast, env);
      case "if":
        return malEvalIf(ast, env);
      case "fn*":
        return malEvalFn(ast, env);
    }
  }
  const evalResult = malEvalAst(ast, env);
  if (evalResult.isErr()) return evalResult;
  const list = evalResult.value;
  if (list.type !== "list") {
    throw new Error(`evalAst returned an unexpected type: ${printForm(list)}`);
  }
  if (list.value.length !== ast.value.length) {
    throw new Error("evalAst returned a different length list");
  }
  const [malFn, ...args] = list.value;
  return malCall(malFn, ...args);
}

function print(
  evalResult: Result<MalType, MalError>
): Result<string, MalError> {
  return evalResult.map((form) => {
    if (process.env.DEBUG) {
      console.debug(debugForm(form));
    }
    return printForm(form);
  });
}

function rep(input: string): Result<string, MalError> {
  return read(input).andThen((form) => print(malEval(form, coreEnv)));
}

function startRepl() {
  rep("(def! not (fn* (a) (if a false true)))");

  const rl = readline.createInterface(process.stdin, process.stdout);
  rl.setPrompt("user> ");
  rl.on("line", (input) => {
    rep(input).match(
      (output) => {
        console.log(output);
      },
      (error) => console.log("\x1b[31mERROR: %s\x1b[0m", error.message)
    );
    rl.prompt();
  });
  rl.prompt();
}

startRepl();
