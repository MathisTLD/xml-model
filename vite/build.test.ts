import { beforeAll, expect, test } from "vitest";

import { build } from "vite";
import { describe } from "node:test";
import { resolve } from "path";

import { exec as _exec } from "child_process";
import { promisify } from "util";
import { statSync } from "fs";

const exec = promisify(_exec);

const exampleProject = resolve(import.meta.dirname, "example");

describe("vite plugin", () => {
  beforeAll(async () => {
    // ensure the plugin is built
    await build({ root: import.meta.dirname });
    // build the test project
    await exec("vite build", { cwd: exampleProject });
  });
  test("project built", async () => {
    expect(statSync(resolve(exampleProject, "dist")).isDirectory()).toBe(true);
    expect(statSync(resolve(exampleProject, "dist", "index.js")).isFile()).toBe(true);
    const { stdout } = await exec(`node ${resolve(exampleProject, "dist", "index.js")}`);
    expect(stdout).toBe("<my-class><foo>bar</foo></my-class>\n");
  });
});
