import readline from "readline";

function read(input: string): string {
  return input;
}

function evalInput(input: string): string {
  return input;
}

function print(input: string): string {
  return input;
}

function rep(input: string): string {
  return print(evalInput(read(input)));
}

function startRepl() {
  const rl = readline.createInterface(process.stdin, process.stdout);
  rl.setPrompt("user> ");
  rl.on("line", (input) => {
    const result = rep(input);
    console.log(result);
    rl.prompt();
  });
  rl.prompt();
}

startRepl();
