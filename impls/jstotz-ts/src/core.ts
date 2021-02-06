import { MalEnv, malEnvSet, malNewEnv } from "./env";
import { malUnwrapAll } from "./errors";
import { malFunction, MalFunctionValue, malNumber } from "./types";

const coreEnv: MalEnv = malNewEnv();

function malDefCore(name: string, fn: MalFunctionValue) {
  malEnvSet(coreEnv, name, malFunction(fn));
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

export default coreEnv;
