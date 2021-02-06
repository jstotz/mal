import { combine, err, ok, Result } from "neverthrow";
import readline from "readline";
import { MalEnv, malEnvGet, malEnvSet, malNewEnv } from "./env";
import { MalError, malUnwrap, malUnwrapAll } from "./errors";
import { debugForm, printForm } from "./printer";
import { readStr } from "./reader";
import { malFunction as malFn, MalList, malNumber, MalType } from "./types";

function read(input: string) {
  return readStr(input);
}

function malCall(
  malFn: MalType,
  ...args: MalType[]
): Result<MalType, MalError> {
  return malUnwrap("function", malFn).andThen((fn) => fn(...args));
}

const replEnv: MalEnv = malNewEnv();

malEnvSet(
  replEnv,
  "+",
  malFn((...args) =>
    malUnwrapAll("number", args).map((numbers) =>
      malNumber(numbers.reduce((a, b) => a + b))
    )
  )
);

malEnvSet(
  replEnv,
  "-",
  malFn((...args) =>
    malUnwrapAll("number", args).map((numbers) =>
      malNumber(numbers.reduce((a, b) => a - b))
    )
  )
);

malEnvSet(
  replEnv,
  "*",
  malFn((...args) =>
    malUnwrapAll("number", args).map((numbers) =>
      malNumber(numbers.reduce((a, b) => a * b))
    )
  )
);

malEnvSet(
  replEnv,
  "/",
  malFn((...args) =>
    malUnwrapAll("number", args).map((numbers) =>
      malNumber(numbers.reduce((a, b) => a / b))
    )
  )
);

function evalAst(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  switch (ast.type) {
    case "list":
    case "vector":
      return combine(ast.value.map((a) => evalMal(a, env))).map((values) => ({
        type: ast.type,
        value: values,
      }));
    case "hash_map": {
      return combine(
        Array.from(ast.value).map(([key, value]) =>
          evalMal(value, env).map((evaled) => ({ key, value: evaled }))
        )
      )
        .map((evaledPairs) => {
          console.log("evaledPairs", evaledPairs);
          return evaledPairs;
        })
        .map((evaledPairs) => ({
          type: "hash_map",
          value: new Map<string, MalType>(
            evaledPairs.map((pair) => [pair.key, pair.value])
          ),
        }));
    }
    case "symbol": {
      let value = malEnvGet(env, ast.value);
      if (value === undefined) {
        return err({
          type: "symbol_not_found",
          message: `Symbol not found: ${ast.value}`,
        });
      }
      return ok(value);
    }
    default:
      return ok(ast);
  }
}

function evalMalDef(list: MalList, env: MalEnv): Result<MalType, MalError> {
  const [, keySymbol, valueAst] = list.value;
  if (keySymbol?.type !== "symbol") {
    return err({ type: "type_error", message: "Expected symbol key in def!" });
  }
  if (valueAst === undefined) {
    return err({ type: "type_error", message: "Expected value in def!" });
  }
  return evalMal(valueAst, env).andThen((evaled) =>
    ok(malEnvSet(env, keySymbol.value, evaled))
  );
}

function evalMalLet(list: MalList, env: MalEnv): Result<MalType, MalError> {
  return err({ type: "type_error", message: "not implemented" });
}

function evalMal(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  if (ast.type !== "list") {
    return evalAst(ast, env);
  }

  if (ast.value.length === 0) return ok(ast);
  if (ast.value[0].type === "symbol") {
    switch (ast.value[0].value) {
      case "def!":
        return evalMalDef(ast, env);
      case "let*":
        return evalMalLet(ast, env);
    }
  }
  let evalResult = evalAst(ast, env);
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
  return read(input).andThen((form) => print(evalMal(form, replEnv)));
}

function startRepl() {
  let rl = readline.createInterface(process.stdin, process.stdout);
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