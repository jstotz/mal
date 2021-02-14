import fs from "fs";
import { combine, err, ok, Result } from "neverthrow";
import { MalEnv, malEnvSet, malNewEnv } from "./env";
import { MalError } from "./errors";
import { printForm } from "./printer";
import { malBuildHashMap, readStr } from "./reader";
import { readline } from "./readline";
import {
  malAtomRef,
  malBoolean,
  malEqual,
  malException,
  malFunction,
  MalFunctionValue,
  malHashMap,
  malIsFunction,
  malIsMacroFunction,
  malIsSeq,
  malIsSymbolNamed,
  malKeyword,
  malList,
  malNil,
  malNumber,
  malParseString,
  malString,
  malSymbol,
  MalType,
  malUnwrap,
  malUnwrapAll,
  malUnwrapAllSeq,
  malUnwrapHashMapKey,
  malUnwrapSeq,
  malVector,
} from "./types";

const coreEnv: MalEnv = malNewEnv();

function def(name: string, value: MalType) {
  malEnvSet(coreEnv, name, value);
}

function defFn(name: string, fn: MalFunctionValue) {
  def(name, malFunction(fn));
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

def("*host-language*", malString("jstotz-ts"));

defFn("+", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a + b))
  )
);

defFn("-", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a - b))
  )
);

defFn("*", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a * b))
  )
);

defFn("/", (...args) =>
  malUnwrapAll("number", args).map((numbers) =>
    malNumber(numbers.reduce((a, b) => a / b))
  )
);

defFn("prn", (form) => {
  if (form !== undefined) {
    console.log(printForm(form));
  }
  return ok(malNil());
});

defFn("list", (...forms) => ok(malList(forms)));

defFn("list?", (form) => ok(malBoolean(form?.type === "list")));

defFn("empty?", (form) =>
  malUnwrapSeq(form).map((value) => malBoolean(value.length === 0))
);

defFn("count", (form) => ok(malNumber(malUnwrapSeq(form).unwrapOr([]).length)));

defFn("=", (a, b) => ok(malBoolean(malEqual(a, b))));

defFn(">", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a > b))
);

defFn(">=", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a >= b))
);

defFn("<", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a < b))
);

defFn("<=", (...args) =>
  malUnwrapAll("number", args).map(([a, b]) => malBoolean(a <= b))
);

defFn("pr-str", (...args) =>
  ok(malString(args.map((f) => printForm(f)).join(" ")))
);

defFn("str", (...args) =>
  ok(malString(args.map((f) => printForm(f, false)).join("")))
);

defFn("prn", (...args) => {
  console.log(...args.map((f) => printForm(f)));
  return ok(malNil());
});

defFn("println", (...args) => {
  console.log(...args.map((f) => printForm(f, false)));
  return ok(malNil());
});

defFn("read-string", (str) =>
  malUnwrap("string", str).andThen((str) => readStr(str))
);

defFn("slurp", (fileName) =>
  malUnwrap("string", fileName).andThen((fileName) =>
    ok(malString(fs.readFileSync(fileName).toString()))
  )
);

defFn("atom", (value) => ok(malAtomRef(value)));
defFn("atom?", (value) => ok(malBoolean(value.type === "atom_ref")));
defFn("deref", (atom) => malUnwrap("atom_ref", atom));
defFn("reset!", (atom, value) =>
  malUnwrap("atom_ref", atom).map(() => {
    atom.value = value;
    return value;
  })
);
defFn("swap!", (atom, fn, ...rest) =>
  malUnwrap("atom_ref", atom).andThen((prevValue) =>
    malCallFunction(fn, prevValue, ...rest).map((newValue) => {
      atom.value = newValue;
      return newValue;
    })
  )
);

defFn("cons", (head, tail) =>
  malUnwrapSeq(tail).map((tail) => malList([head].concat(tail)))
);

defFn("concat", (...lists) =>
  malUnwrapAllSeq(lists).map((lists) => malList(lists.flatMap((el) => el)))
);

defFn("vec", (list) => {
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

defFn("quasiquote", malQuasiquote);

defFn("nth", (seq, index) =>
  malUnwrapSeq(seq).andThen((elems) =>
    malUnwrap("number", index).andThen((i) => {
      if (i >= elems.length) {
        return err(malException(malString("index out of range")));
      }
      return ok(elems[i]);
    })
  )
);

defFn("first", (seq) => {
  if (seq.type === "nil") {
    return ok(malNil());
  }
  return malUnwrapSeq(seq).map((elems) => elems[0] ?? malNil());
});

defFn("rest", (seq) => {
  if (seq.type === "nil") {
    return ok(malList([]));
  }
  return malUnwrapSeq(seq).map((elems) => malList(elems.slice(1)));
});

defFn("throw", (error) => err(malException(error)));

defFn("nil?", (arg) => ok(malBoolean(arg.type === "nil")));

defFn("true?", (arg) =>
  ok(malBoolean(arg.type === "boolean" && arg.value === true))
);

defFn("false?", (arg) =>
  ok(malBoolean(arg.type === "boolean" && arg.value === false))
);

defFn("symbol?", (arg) => ok(malBoolean(arg.type === "symbol")));

defFn("keyword?", (arg) => ok(malBoolean(arg.type === "keyword")));

defFn("vector?", (arg) => ok(malBoolean(arg.type === "vector")));

defFn("map?", (arg) => ok(malBoolean(arg.type === "hash_map")));

defFn("sequential?", (arg) => ok(malBoolean(malIsSeq(arg))));

defFn("string?", (arg) => ok(malBoolean(arg.type === "string")));

defFn("macro?", (arg) => ok(malBoolean(malIsMacroFunction(arg))));

defFn("number?", (arg) => ok(malBoolean(arg.type === "number")));

defFn("fn?", (arg) => ok(malBoolean(malIsFunction(arg))));

defFn("symbol", (arg) => malUnwrap("string", arg).map((str) => malSymbol(str)));

defFn("vector", (...args) => ok(malVector(args)));

defFn("hash-map", (...args) => malBuildHashMap(args));

defFn("assoc", (map, ...args) =>
  malUnwrap("hash_map", map).andThen((origMap) =>
    malBuildHashMap(args).map(({ value: newMap }) =>
      malHashMap(
        new Map<string, MalType>([
          ...Array.from(origMap),
          ...Array.from(newMap),
        ])
      )
    )
  )
);

defFn("dissoc", (map, ...keys) =>
  malUnwrap("hash_map", map).andThen((map) =>
    malUnwrapAll(["string", "keyword"], keys).andThen((keys) =>
      ok(
        malHashMap(
          new Map(
            Array.from(map.entries()).filter(([key]) => !keys.includes(key))
          )
        )
      )
    )
  )
);

defFn("keyword", (arg) => {
  if (arg.type === "keyword") {
    return ok(arg);
  }
  return malUnwrap("string", arg).map((str) => malKeyword(str));
});

defFn("get", (...args) =>
  combine([
    malUnwrap(["hash_map", "nil"], args[0]),
    malUnwrapHashMapKey(args[1]),
  ] as const).map(([map, key]) => map?.get(key) ?? malNil())
);

defFn("contains?", (aMap, aKey) =>
  combine([
    malUnwrap("hash_map", aMap),
    malUnwrapHashMapKey(aKey),
  ] as const).map(([map, key]) => malBoolean(map.has(key)) ?? malNil())
);

defFn("keys", (aMap) =>
  malUnwrap("hash_map", aMap).map((map) =>
    malList(Array.from(map.keys()).map((key) => malParseString(key)))
  )
);

defFn("vals", (aMap) =>
  malUnwrap("hash_map", aMap).map((map) => malList(Array.from(map.values())))
);

defFn("apply", (aFn, ...aArgs) =>
  malCallFunction(
    aFn,
    ...aArgs.flatMap((arg) => (malIsSeq(arg) ? arg.value : arg))
  )
);

defFn("map", (aFn, aSeq) =>
  malUnwrapSeq(aSeq).andThen((elems) => {
    const returnElems: MalType[] = [];
    for (const elem of elems) {
      const result = malCallFunction(aFn, elem);
      if (result.isErr()) return result;
      returnElems.push(result.value);
    }
    return ok(malList(returnElems));
  })
);

defFn("type-of", (aValue) => ok(malString(aValue.type)));

defFn("readline", (aPrompt) =>
  malUnwrap("string", aPrompt).andThen((prompt) => {
    const line = readline(prompt);
    return ok(line === null ? malNil() : malString(line));
  })
);

defFn("time-ms", () => {
  throw "not implemented";
});

defFn("meta", (value) => ok(value.metadata ?? malNil()));

defFn("with-meta", (value, metadata) => ok({ ...value, metadata }));

defFn("seq", () => {
  throw "not implemented";
});

defFn("conj", () => {
  throw "not implemented";
});

export default coreEnv;
