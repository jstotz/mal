import fs from "fs";
import { combine, err, ok, Result } from "neverthrow";
import { MalEnv, malEnvSet, malNewEnv } from "./env";
import { MalError } from "./errors";
import { printForm } from "./printer";
import { malBuildHashMap, readStr } from "./reader";
import {
  malAtomRef,
  malBoolean,
  malEqual,
  malException,
  malFunction,
  MalFunctionValue,
  malHashMap,
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

malDefCore("nth", (seq, index) =>
  malUnwrapSeq(seq).andThen((elems) =>
    malUnwrap("number", index).andThen((i) => {
      if (i >= elems.length) {
        return err(malException(malString("index out of range")));
      }
      return ok(elems[i]);
    })
  )
);

malDefCore("first", (seq) => {
  if (seq.type === "nil") {
    return ok(malNil());
  }
  return malUnwrapSeq(seq).map((elems) => elems[0] ?? malNil());
});

malDefCore("rest", (seq) => {
  if (seq.type === "nil") {
    return ok(malList([]));
  }
  return malUnwrapSeq(seq).map((elems) => malList(elems.slice(1)));
});

malDefCore("throw", (error) => err(malException(error)));

malDefCore("nil?", (arg) => ok(malBoolean(arg.type === "nil")));

malDefCore("true?", (arg) =>
  ok(malBoolean(arg.type === "boolean" && arg.value === true))
);

malDefCore("false?", (arg) =>
  ok(malBoolean(arg.type === "boolean" && arg.value === false))
);

malDefCore("symbol?", (arg) => ok(malBoolean(arg.type === "symbol")));

malDefCore("keyword?", (arg) => ok(malBoolean(arg.type === "keyword")));

malDefCore("vector?", (arg) => ok(malBoolean(arg.type === "vector")));

malDefCore("map?", (arg) => ok(malBoolean(arg.type === "hash_map")));

malDefCore("sequential?", (arg) => ok(malBoolean(malIsSeq(arg))));

malDefCore("symbol", (arg) =>
  malUnwrap("string", arg).map((str) => malSymbol(str))
);

malDefCore("vector", (...args) => ok(malVector(args)));

malDefCore("hash-map", (...args) => malBuildHashMap(args));

malDefCore("assoc", (map, ...args) =>
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

malDefCore("dissoc", (map, ...keys) =>
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

malDefCore("keyword", (arg) => {
  if (arg.type === "keyword") {
    return ok(arg);
  }
  return malUnwrap("string", arg).map((str) => malKeyword(str));
});

malDefCore("get", (...args) =>
  combine([
    malUnwrap(["hash_map", "nil"], args[0]),
    malUnwrapHashMapKey(args[1]),
  ] as const).map(([map, key]) => map?.get(key) ?? malNil())
);

malDefCore("contains?", (aMap, aKey) =>
  combine([
    malUnwrap("hash_map", aMap),
    malUnwrapHashMapKey(aKey),
  ] as const).map(([map, key]) => malBoolean(map.has(key)) ?? malNil())
);

malDefCore("keys", (aMap) =>
  malUnwrap("hash_map", aMap).map((map) =>
    malList(Array.from(map.keys()).map((key) => malParseString(key)))
  )
);

malDefCore("vals", (aMap) =>
  malUnwrap("hash_map", aMap).map((map) => malList(Array.from(map.values())))
);

malDefCore("apply", (aFn, ...aArgs) =>
  malCallFunction(
    aFn,
    ...aArgs.flatMap((arg) => (malIsSeq(arg) ? arg.value : arg))
  )
);

malDefCore("map", (aFn, aSeq) =>
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

malDefCore("type-of", (aValue) => {
  return ok(malString(aValue.type));
});

export default coreEnv;
