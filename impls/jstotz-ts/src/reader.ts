import { err, ok, Result } from "neverthrow";
import { MalError } from "./errors";
import {
  MalAtom,
  malBoolean,
  MalHashMap,
  malKeyword,
  MalList,
  malNil,
  malNumber,
  MalString,
  malSymbol,
  MalType,
  MalVector,
} from "./types";

type Token = string;

const tokenRegexp = /[\s,]*(~@|[[\]{}()'`~^@]|"(?:\\.|[^\\"])*"?|;.*|[^\s[\]{}('"`,;)]*)/g;

type ReadResult<T extends MalType> = Result<T, MalError>;

class Reader {
  position = 0;

  constructor(private tokens: Token[]) {}

  peek(): string {
    return this.tokens[this.position];
  }

  next(): string {
    const token = this.peek();
    this.position++;
    return token;
  }
}

function tokenize(input: string): Token[] {
  return Array.from(
    input.matchAll(tokenRegexp),
    (match) => Array.from(match)[1]
  ).filter((token) => token[0] !== ";");
}

export function readStr(input: string): ReadResult<MalType> {
  const tokens = tokenize(input);
  if (process.env.DEBUG) {
    console.debug("TOKENS: ", tokens);
  }
  const reader = new Reader(tokens);
  return readForm(reader);
}

function readSequence<T extends MalType>(
  reader: Reader,
  startToken: Token,
  endToken: Token,
  buildForm: (forms: MalType[]) => ReadResult<T>
): ReadResult<T> {
  const forms: MalType[] = [];
  const token = reader.next();
  if (token !== startToken) {
    return err({
      type: "unexpected_token",
      message: `Unexpected token reading list. Expected ${startToken}. Got ${token}`,
      token: token,
    });
  }
  for (;;) {
    const token = reader.peek();
    if (token === endToken) {
      reader.next();
      return buildForm(forms);
    }

    if (token === "") {
      return err({
        type: "unexpected_eof",
        message: `Unexpected EOF while reading list. Expected ${endToken}`,
      });
    }

    const result = readForm(reader);
    if (result.isErr()) {
      return err(result.error);
    }
    forms.push(result.value);
  }
}

function parseStringLiteral(token: Token): ReadResult<MalString> {
  const errorEof: MalError = {
    type: "unexpected_eof",
    message: 'Unexpected EOF while parsing string. Expected "',
  };
  let escapedStr = "";
  let inEscape = false;
  if (token.length === 1) {
    return err(errorEof);
  }
  for (let i = 1; i < token.length; i++) {
    const chr = token[i];

    if (i === token.length - 1) {
      if (chr !== '"' || inEscape) {
        return err(errorEof);
      }
      break;
    }

    if (inEscape) {
      inEscape = false;
      if (chr === "n") {
        escapedStr += "\n";
      } else {
        escapedStr += chr;
      }
      continue;
    }

    if (chr === "\\") {
      inEscape = true;
      continue;
    }

    escapedStr += chr;
  }
  return ok({
    type: "string",
    value: escapedStr,
  });
}

function readAtom(reader: Reader): ReadResult<MalAtom> {
  const token = reader.next();
  if (token.match(/^-?\d+/)) {
    return ok(malNumber(parseInt(token, 10)));
  } else if (token[0] === '"') {
    return parseStringLiteral(token);
  } else if (token[0] === ":") {
    return ok(malKeyword(token.slice(1)));
  } else if (token === "true") {
    return ok(malBoolean(true));
  } else if (token === "false") {
    return ok(malBoolean(false));
  } else if (token === "nil") {
    return ok(malNil());
  } else {
    return ok(malSymbol(token));
  }
}

export function malBuildHashMap(forms: MalType[]): ReadResult<MalHashMap> {
  if (forms.length % 2 !== 0) {
    return err({
      type: "invalid_hash_map",
      message: "Invalid hash map. Odd number of keys and values",
    });
  }
  const map = new Map<string, MalType>();
  for (let i = 0; i < forms.length; i += 2) {
    const keyForm = forms[i];
    const valueForm = forms[i + 1];
    if (keyForm.type !== "string" && keyForm.type !== "keyword") {
      return err({
        type: "invalid_hash_map",
        message: `Invalid hash map. Keys must be a string or a keyword. Got ${keyForm.type}`,
      });
    }
    map.set(keyForm.value, valueForm);
  }
  return ok({
    type: "hash_map",
    value: map,
  });
}

function readMacro(symbol: string, reader: Reader): ReadResult<MalList> {
  reader.next(); // consume macro symbol
  return readForm(reader).map((f) => ({
    type: "list",
    value: [{ type: "symbol", value: symbol }, f],
  }));
}

function readWithMeta(reader: Reader): ReadResult<MalList> {
  reader.next(); // consume prefix
  return readForm(reader).andThen((metaForm) =>
    readForm(reader).map((form) => ({
      type: "list",
      value: [{ type: "symbol", value: "with-meta" }, form, metaForm],
    }))
  );
}

function readForm(reader: Reader): ReadResult<MalType> {
  switch (reader.peek()) {
    case "(":
      return readSequence<MalList>(reader, "(", ")", (forms) =>
        ok({ type: "list", value: forms })
      );
    case "[":
      return readSequence<MalVector>(reader, "[", "]", (forms) =>
        ok({ type: "vector", value: forms })
      );
    case "{":
      return readSequence<MalHashMap>(reader, "{", "}", malBuildHashMap);
    case "'":
      return readMacro("quote", reader);
    case "`":
      return readMacro("quasiquote", reader);
    case "~":
      return readMacro("unquote", reader);
    case "~@":
      return readMacro("splice-unquote", reader);
    case "@":
      return readMacro("deref", reader);
    case "^":
      return readWithMeta(reader);
    default:
      return readAtom(reader);
  }
}
