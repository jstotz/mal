import { MalKeyword, MalString, MalType } from "./types";

function hashMapKeyToForm(value: string): MalString | MalKeyword {
  if (value[0] === ":") {
    return { type: "keyword", value: value };
  } else {
    return { type: "string", value: value };
  }
}

export function printForm(form: MalType, readably = true): string {
  switch (form.type) {
    case "list":
      return `(${form.value.map((f) => printForm(f, readably)).join(" ")})`;
    case "vector":
      return `[${form.value.map((f) => printForm(f, readably)).join(" ")}]`;
    case "hash_map":
      return `{${Array.from(form.value)
        .map(
          ([k, v]) =>
            `${printForm(hashMapKeyToForm(k))} ${printForm(v, readably)}`
        )
        .join(" ")}}`;
    case "nil":
      return "nil";
    case "string":
      if (readably === true) {
        // TODO: don't cheat by using JSON stringify
        return JSON.stringify(form.value);
      } else {
        console.log("not readably:", form.value);
        return form.value;
      }
    case "boolean":
    case "number":
    case "keyword":
    case "symbol":
      return String(form.value);
    case "function":
      return "#<function>";
    default:
      const unhandledForm: never = form;
      throw new Error(`Unhandled form type: ${unhandledForm}`);
  }
}

export function debugForm(form: MalType): string {
  return JSON.stringify(
    form,
    (_key, value) => {
      if (value instanceof Map) {
        return Array.from(value).reduce(
          (obj, [key, value]) => Object.assign(obj, { [key]: value }),
          {}
        );
      } else {
        return value;
      }
    },
    2
  );
}
