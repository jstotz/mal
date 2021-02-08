import fs from "fs";
import { err, ok, Result } from "neverthrow";
import { MalEnv, malEnvSet, malNewEnv } from "./env";
import {
  MalError,
  malUnwrap,
  malUnwrapAll,
  malUnwrapAllSeq,
  malUnwrapSeq,
} from "./errors";
import { printForm } from "./printer";
import { readStr } from "./reader";
import {
  malAtomRef,
  malBoolean,
  malEqual,
  malFunction,
  MalFunctionValue,
  malIsSeq,
  malIsSymbolNamed,
  malList,
  malNil,
  malNumber,
  malString,
  malSymbol,
  MalType,
  malVector,
} from "./types";

const coreEnv: MalEnv = malNewEnv();

function malDefCore(name: string, fn: MalFunctionValue) {
  malEnvSet(coreEnv, name, malFunction(fn));
}

export function malCallFunction(
  fn: MalType | undefined,
  ...args: MalType[]
): Result<MalType, MalError> {
  switch (fn?.type) {
    case "function":
      return fn.value(...args);
    case "function_def":
      return fn.value.function.value(...args);
    default:
      return err({ type: "type_error", message: "Not a function" });
  }
}

malDefCore("+", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a + b))
  )
);

malDefCore("-", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a - b))
  )
);

malDefCore("*", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a * b))
  )
);

malDefCore("/", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a / b))
  )
);

malDefCore("prn", (form) => {
  if (form !== undefined) {
    console.log(printForm(form));
  }
  return ok(malNil());
});

malDefCore("list", (...forms) => ok(malList(forms)));

malDefCore("list?", (form) => ok(malBoolean(form?.type === "list")));

malDefCore("empty?", (form) =>
  malUnwrapSeq(form).map((value) => malBoolean(value.length === 0))
);

malDefCore("count", (form) =>
  ok(malNumber(malUnwrapSeq(form).unwrapOr([]).length))
);

malDefCore("=", (a, b) => ok(malBoolean(malEqual(a, b))));

malDefCore(">", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a > b))
);

malDefCore(">=", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a >= b))
);

malDefCore("<", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a < b))
);

malDefCore("<=", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a <= b))
);

malDefCore("pr-str", (...args) =>
  ok(malString(args.map((f) => printForm(f)).join(" ")))
);

malDefCore("str", (...args) =>
  ok(malString(args.map((f) => printForm(f, false)).join("")))
);

malDefCore("prn", (...args) => {
  console.log(...args.map((f) => printForm(f)));
  return ok(malNil());
});

malDefCore("println", (...args) => {
  console.log(...args.map((f) => printForm(f, false)));
  return ok(malNil());
});

malDefCore("read-string", (str) =>
  malUnwrap("string", str).andThen((str) => readStr(str))
);

malDefCore("slurp", (fileName) =>
  malUnwrap("string", fileName).andThen((fileName) =>
    ok(malString(fs.readFileSync(fileName).toString()))
  )
);

malDefCore("atom", (value) => ok(malAtomRef(value)));
malDefCore("atom?", (value) => ok(malBoolean(value.type === "atom_ref")));
malDefCore("deref", (atom) => malUnwrap("atom_ref", atom));
malDefCore("reset!", (atom, value) =>
  malUnwrap("atom_ref", atom).map(() => {
    atom.value = value;
    return value;
  })
);
malDefCore("swap!", (atom, fn, ...rest) =>
  malUnwrap("atom_ref", atom).andThen((prevValue) =>
    malCallFunction(fn, prevValue, ...rest).map((newValue) => {
      atom.value = newValue;
      return newValue;
    })
  )
);

malDefCore("cons", (head, tail) =>
  malUnwrapSeq(tail).map((tail) => malList([head].concat(tail)))
);

malDefCore("concat", (...lists) =>
  malUnwrapAllSeq(lists).map((lists) => malList(lists.flatMap((el) => el)))
);

malDefCore("vec", (list) => {
  console.log("vec args", list);
  if (list.type === "vector") return ok(list);
  return malUnwrap("list", list).map((list) => malVector(list));
});

function malQuasiquote(ast: MalType): Result<MalType, MalError> {
  if (ast.type === "list" && malIsSymbolNamed(ast.value[0], "unquote")) {
    return ok(ast.value[1]);
  }

  if (malIsSeq(ast)) {
    let result = malList([]);
    for (let i = ast.value.length - 1; i >= 0; i--) {
      const elt = ast.value[i];
      if (
        elt.type === "list" &&
        malIsSymbolNamed(elt.value[0], "splice-unquote")
      ) {
        result = malList([malSymbol("concat"), elt.value[1], result]);
      } else {
        const quasiquoted = malQuasiquote(elt);
        if (quasiquoted.isErr()) return quasiquoted;
        result = malList([malSymbol("cons"), quasiquoted.value, result]);
      }
    }
    if (ast.type === "vector") {
      result = malList([malSymbol("vec"), result]);
    }
    return ok(result);
  }

  if (ast.type === "symbol" || ast.type === "hash_map") {
    return ok(malList([malSymbol("quote"), ast]));
  }

  return ok(ast);
}

malDefCore("quasiquote", malQuasiquote);

export default coreEnv;
