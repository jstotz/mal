import fs from "fs";
import { ok, Result } from "neverthrow";
import { MalEnv, malEnvSet, malNewEnv } from "./env";
import { MalError, malUnwrap, malUnwrapAll, malUnwrapSeq } from "./errors";
import { printForm } from "./printer";
import { readStr } from "./reader";
import {
  malAtomRef,
  malBoolean,
  malEqual,
  malFunction,
  MalFunctionValue,
  malList,
  malNil,
  malNumber,
  malString,
  MalType,
} from "./types";

const coreEnv: MalEnv = malNewEnv();

function malDefCore(name: string, fn: MalFunctionValue) {
  malEnvSet(coreEnv, name, malFunction(fn));
}

function malCallFunction(
  fn: MalType,
  ...args: MalType[]
): Result<MalType, MalError> {
  switch (fn.type) {
    case "function":
      return fn.value(...args);
    case "function_def":
      return fn.value.function.value(...args);
  }
  return ok(malNil());
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
  malUnwrap("atom_ref", atom).map((_) => {
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

export default coreEnv;
