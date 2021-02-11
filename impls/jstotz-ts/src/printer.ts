import { malParseString, MalType } from "./types";

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
            `${printForm(malParseString(k))} ${printForm(v, readably)}`
        )
        .join(" ")}}`;
    case "nil":
      return "nil";
    case "string":
      if (readably === true) {
        // TODO: don't cheat by using JSON stringify
        return JSON.stringify(form.value);
      } else {
        return form.value;
      }
    case "keyword":
      return `:${form.value.slice(1)}`;
    case "boolean":
    case "number":
    case "symbol":
      return String(form.value);
    case "function":
      return "#<function>";
    case "function_def":
      return "#<function*>";
    case "atom_ref":
      return `(atom ${printForm(form.value, readably)})`;
    default: {
      const unhandledForm: never = form;
      throw new Error(`Unhandled form type: ${unhandledForm}`);
    }
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
