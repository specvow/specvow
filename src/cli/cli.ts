#!/usr/bin/env node
import { execute } from "./run.js";

const io = {
  log: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
};

execute(process.argv.slice(2), process.cwd(), io).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  },
);
