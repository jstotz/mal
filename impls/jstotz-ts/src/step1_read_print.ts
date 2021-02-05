import { Result } from "neverthrow";
import readline from "readline";
import { debugForm, printForm } from "./printer";
import { readStr } from "./reader";
import { MalError, MalType } from "./types";

function read(input: string) {
  return readStr(input);
}

function evalInput(form: MalType): MalType {
  return form;
}

function print(form: MalType): string {
  if (process.env.DEBUG) {
    console.debug(debugForm(form));
  }
  return printForm(form);
}

function rep(input: string): Result<string, MalError> {
  return read(input).map((form) => print(evalInput(form)));
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
