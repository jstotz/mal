import { combine, err, ok, Result } from "neverthrow";
import readline from "readline";
import { debugForm, printForm } from "./printer";
import { readStr } from "./reader";
import {
  MalError,
  malFunction as malFn,
  MalFunction,
  malNumber,
  MalType,
} from "./types";

function read(input: string) {
  return readStr(input);
}

type MalEnv = Map<string, MalFunction | MalType>;

function malUnwrap<
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

function malUnwrapAll<
  T extends MalType["type"],
  Value = Extract<MalType, { type: T }>["value"]
>(type: T, ast: MalType[]): Result<Value[], MalError> {
  return combine(ast.map((v) => malUnwrap<T, Value>(type, v)));
}

function malCall(
  malFn: MalType,
  ...args: MalType[]
): Result<MalType, MalError> {
  return malUnwrap("function", malFn).andThen((fn) => fn(...args));
}

const replEnv: MalEnv = new Map([
  [
    "+",
    malFn((...args) =>
      malUnwrapAll("number", args).map((numbers) =>
        malNumber(numbers.reduce((a, b) => a + b))
      )
    ),
  ],
  [
    "-",
    malFn((...args) =>
      malUnwrapAll("number", args).map((numbers) =>
        malNumber(numbers.reduce((a, b) => a - b))
      )
    ),
  ],
  [
    "*",
    malFn((...args) =>
      malUnwrapAll("number", args).map((numbers) =>
        malNumber(numbers.reduce((a, b) => a * b))
      )
    ),
  ],
  [
    "/",
    malFn((...args) =>
      malUnwrapAll("number", args).map((numbers) =>
        malNumber(numbers.reduce((a, b) => a / b))
      )
    ),
  ],
]);

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
      let value = env.get(ast.value);
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

function evalMal(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  if (ast.type !== "list") {
    return evalAst(ast, env);
  }

  if (ast.value.length === 0) return ok(ast);
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
