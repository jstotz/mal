import { combine, err, ok, Result } from "neverthrow";
import readline from "readline";
import coreEnv, { malCallFunction } from "./core";
import { MalEnv, malEnvGet, malEnvSet, malNewEnv } from "./env";
import { MalError, malUnwrapAll } from "./errors";
import { printForm } from "./printer";
import { readStr } from "./reader";
import {
  malFunction,
  MalFunctionDef,
  malIsMacroFunction,
  malIsSeq,
  malList,
  MalList,
  malNil,
  malString,
  MalSymbol,
  MalType,
} from "./types";

function read(input: string) {
  return readStr(input);
}

interface MalState {
  ast: MalType;
  env: MalEnv;
  error?: MalError;
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
          message: `'${ast.value}' not found`,
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

function malEvalDefMacro(ast: MalList, env: MalEnv): Result<MalType, MalError> {
  return malEvalDef(ast, env).andThen((fn) => {
    if (fn.type === "function") {
      fn.isMacro = true;
      return ok(fn);
    }
    if (fn.type === "function_def") {
      fn.value.function.isMacro = true;
      return ok(fn);
    }
    return err({
      type: "type_error",
      message: "defmacro! expects a function arg",
    });
  });
}

function malEvalLet(
  list: MalList,
  state: MalState
): Result<MalState, MalError> {
  const letEnv = malNewEnv(state.env);
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
    if (evaledBindingValue.isErr()) return err(evaledBindingValue.error);
    malEnvSet(letEnv, bindingKey.value, evaledBindingValue.value);
  }
  return ok({
    ast: body,
    env: letEnv,
  });
}

function malEvalDo(list: MalList, state: MalState): Result<MalState, MalError> {
  for (let i = 1; i < list.value.length; i++) {
    const form = list.value[i];
    const evalResult = malEval(form, state.env);
    if (evalResult.isErr()) return err(evalResult.error);
    if (i === list.value.length - 1) {
      return ok({ ...state, ast: evalResult.value });
    }
  }
  return ok({ ...state, ast: malNil() });
}

function malCastBoolean(ast: MalType): boolean {
  if (ast.type === "boolean") return ast.value;
  if (ast.type === "nil") return false;
  return true;
}

function malEvalIf(list: MalList, state: MalState): Result<MalState, MalError> {
  const [, cond, ifBody, elseBody] = list.value;
  if (ifBody === undefined) {
    return err({ type: "type_error", message: "if called without a body" });
  }
  const condResult = malEval(cond, state.env);
  if (condResult.isErr()) return err(condResult.error);
  if (malCastBoolean(condResult.value)) {
    return ok({ ...state, ast: ifBody });
  } else {
    return ok({ ...state, ast: elseBody ?? malNil() });
  }
}

function malIsMacroCall(
  ast: MalType,
  env: MalEnv
): ast is MalList<[MalSymbol, ...MalType[]]> {
  if (ast.type !== "list") return false;
  const first = ast.value[0];
  if (first?.type !== "symbol") return false;
  return malIsMacroFunction(malEnvGet(env, first.value));
}

function malMacroExpand(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  while (malIsMacroCall(ast, env)) {
    const macroFn = malEnvGet(env, ast.value[0].value);
    const result = malCallFunction(macroFn, ...ast.value.slice(1));
    if (result.isErr()) return result;
    ast = result.value;
  }
  return ok(ast);
}

function malEvalFnDef(
  list: MalList,
  outerEnv: MalEnv
): Result<MalFunctionDef, MalError> {
  const [, bindings, body] = list.value;
  if (!malIsSeq(bindings)) {
    return err({
      type: "type_error",
      message: "function bindings must be a sequence",
    });
  }
  return malUnwrapAll("symbol", bindings.value).andThen((bindingKeys) =>
    ok({
      type: "function_def",
      value: {
        body,
        env: outerEnv,
        paramNames: bindingKeys,
        function: malFunction((...args) =>
          malEval(body, malNewEnv(outerEnv, bindingKeys, args))
        ),
      },
    })
  );
}

function malEvalTryCatch(
  args: MalType[],
  env: MalEnv
): Result<MalType, MalError> {
  {
    const catchAst = args[1] as
      | MalList<[MalSymbol, MalSymbol, MalType]>
      | undefined;
    return malEval(args[0], env).orElse((e) => {
      if (catchAst === undefined) {
        return err(e);
      }
      const [, errorBindingKey, catchBodyAst] = catchAst.value;
      return malEval(
        catchBodyAst,
        malNewEnv(
          env,
          [errorBindingKey.value],
          [e.type === "exception" ? e.data : malString(e.message)]
        )
      );
    });
  }
}

function malEval(ast: MalType, env: MalEnv): Result<MalType, MalError> {
  let state: MalState = { ast: ast, env: env };
  const updateState = (result: Result<MalState, MalError>) => {
    if (result.isErr()) {
      state.error = result.error;
      return;
    }
    state = result.value;
  };
  for (;;) {
    let { ast } = state;
    const { env, error } = state;
    if (error !== undefined) {
      return err(error);
    }
    if (ast.type !== "list") {
      return malEvalAst(ast, env);
    }

    const macroExpandResult = malMacroExpand(ast, env);
    if (macroExpandResult.isErr()) return macroExpandResult;
    ast = macroExpandResult.value;
    if (ast.type !== "list") {
      return malEvalAst(ast, env);
    }

    const elems = ast.value;
    if (elems.length === 0) return ok(ast);
    if (elems[0].type === "symbol") {
      const [symbol, ...args] = elems;
      switch (symbol.value) {
        case "def!":
          return malEvalDef(ast, env);
        case "defmacro!":
          return malEvalDefMacro(ast, env);
        case "macroexpand":
          return malMacroExpand(args[0], env);
        case "let*":
          updateState(malEvalLet(ast, state));
          continue;
        case "try*":
          return malEvalTryCatch(args, env);
        case "do":
          updateState(malEvalDo(ast, state));
          continue;
        case "if":
          updateState(malEvalIf(ast, state));
          continue;
        case "fn*":
          return malEvalFnDef(ast, env);
        case "quote":
          return ok(args[0]);
        case "quasiquoteexpand":
          return malCallFunction(malEnvGet(env, "quasiquote"), ast.value[1]);
        case "quasiquote":
          updateState(
            malCallFunction(malEnvGet(env, "quasiquote"), ast.value[1]).map(
              (ast) => ({
                ...state,
                ast,
              })
            )
          );
          continue;
      }
    }

    const evalResult = malEvalAst(ast, env);
    if (evalResult.isErr()) return evalResult;
    const list = evalResult.value;
    if (list.type !== "list") {
      throw new Error(
        `evalAst returned an unexpected type: ${printForm(list)}`
      );
    }
    if (list.value.length !== ast.value.length) {
      throw new Error("evalAst returned a different length list");
    }
    const [malFn, ...args] = list.value;
    switch (malFn.type) {
      case "function":
        return malFn.value(...args);
      case "function_def":
        state = {
          ...state,
          ast: malFn.value.body,
          env: malNewEnv(malFn.value.env, malFn.value.paramNames, args),
        };
        continue;
    }
  }
}

function print(
  evalResult: Result<MalType, MalError>
): Result<string, MalError> {
  return evalResult.map((form) => {
    if (process.env.DEBUG) {
      // console.debug(debugForm(form));
    }
    return printForm(form);
  });
}

function rep(input: string): Result<string, MalError> {
  return read(input).andThen((form) => print(malEval(form, coreEnv)));
}

function startRepl() {
  const mustEval = (input: string) =>
    read(input)
      .andThen((form) => malEval(form, coreEnv))
      .orElse((e) => {
        throw e;
      });

  mustEval("(def! not (fn* (a) (if a false true)))");
  mustEval(
    '(def! load-file (fn* (f) (eval (read-string (str "(do " (slurp f) "\nnil)")))))'
  );
  mustEval(
    "(defmacro! cond (fn* (& xs) (if (> (count xs) 0) (list 'if (first xs) (if (> (count xs) 1) (nth xs 1) (throw \"odd number of forms to cond\")) (cons 'cond (rest (rest xs)))))))"
  );

  malEnvSet(
    coreEnv,
    "eval",
    malFunction((ast) => malEval(ast, coreEnv))
  );

  malEnvSet(
    coreEnv,
    "*ARGV*",
    malList(process.argv.slice(3).map((arg) => malString(arg)))
  );

  if (process.argv.length > 2) {
    mustEval(`(load-file ${printForm(malString(process.argv[2]))})`);
    return;
  }

  const rl = readline.createInterface(process.stdin, process.stdout);
  rl.setPrompt("user> ");
  rl.on("line", (input) => {
    rep(input).match(
      (output) => {
        console.log(output);
      },
      (error) =>
        console.log(
          "\x1b[31mERROR: %s\x1b[0m",
          error.message,
          error.type === "exception" ? printForm(error.data) : ""
        )
    );
    rl.prompt();
  });
  rl.prompt();
}

startRepl();
