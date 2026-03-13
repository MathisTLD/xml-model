import { beforeAll, expect, test } from "vitest";
import { withTmpDir } from "marmotte/vitest/tmpdir";

import { describe } from "node:test";
import { resolve } from "path";

import { exec as _exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, statSync, readFileSync } from "fs";
import { mkdir } from "fs/promises";

const exec = promisify(_exec);

const rootDir = resolve(import.meta.dirname, "..", "..");

describe("vite plugin", () => {
  const tmp = withTmpDir();
  beforeAll(async () => {
    // pack the package into a tarball for a real isolated install
    const { stdout } = await exec(`npm pack --pack-destination ${tmp.path} --json `, {
      cwd: rootDir,
    });
    const tarball = resolve(tmp.path, JSON.parse(stdout)[0].filename);

    // read peer dep versions from root package.json to stay in sync
    const rootPkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
    const { peerDependencies } = rootPkg;

    writeFileSync(
      resolve(tmp.path, "package.json"),
      JSON.stringify({
        type: "module",
        scripts: {
          build: "vite build",
        },
        dependencies: { "xml-model": `file:${tarball}` },
        devDependencies: {
          vite: peerDependencies.vite,
          typescript: peerDependencies.typescript,
          tslib: peerDependencies.tslib,
          "@rollup/plugin-typescript": peerDependencies["@rollup/plugin-typescript"],
        },
      }),
    );
    await mkdir(resolve(tmp.path, "src"));

    writeFileSync(
      resolve(tmp.path, "src", "index.ts"),
      `import { Model } from "xml-model";

@Model({
  fromXML(ctx) {
    const instance = new MyClass();
    if (ctx.properties.foo) instance.foo = ctx.properties.foo;
    return instance;
  },
})
export class MyClass {
  foo = "bar";
}
`,
    );

    writeFileSync(
      resolve(tmp.path, "src", "test.ts"),
      `import { getModel, XML } from "xml-model";

import { MyClass } from ".";

const model = getModel(MyClass);

const a: MyClass = model.fromXML("<my-class><foo>test</foo></my-class>");
console.log(JSON.stringify(a));
const b = new MyClass();
console.log(XML.stringify(model.toXML(b)));
b.foo = "other";
console.log(XML.stringify(model.toXML(b)));
`,
    );

    writeFileSync(
      resolve(tmp.path, "vite.config.ts"),
      `import { defineConfig } from "vite";
import XMLModelVitePlugin from "xml-model/vite";

export default defineConfig({
  plugins: [XMLModelVitePlugin()],
  build: {
    minify: false,
    lib: {
      entry: {
        index: "./src/index.ts",
        test: "./src/test.ts",
      },
      formats: ["es"],
    },
  },
});
`,
    );

    await exec("npm install", { cwd: tmp.path });
    await exec("npm run build", { cwd: tmp.path });
  }, 120_000);

  test("project built", () => {
    expect(statSync(resolve(tmp.path, "dist")).isDirectory()).toBe(true);
    expect(statSync(resolve(tmp.path, "dist", "index.js")).isFile()).toBe(true);
  });

  test("library works as intended", async () => {
    expect((await exec(`node ${resolve(tmp.path, "dist", "test.js")}`)).stdout).toBe(
      `{"foo":"test"}
<my-class><foo>bar</foo></my-class>
<my-class><foo>other</foo></my-class>
`,
    );
  });
});

describe("vite plugin (minified)", () => {
  const tmp = withTmpDir();
  beforeAll(async () => {
    const { stdout } = await exec(`npm pack --pack-destination ${tmp.path} --json`, {
      cwd: rootDir,
    });
    const tarball = resolve(tmp.path, JSON.parse(stdout)[0].filename);

    const rootPkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
    const { peerDependencies } = rootPkg;

    writeFileSync(
      resolve(tmp.path, "package.json"),
      JSON.stringify({
        type: "module",
        scripts: { build: "vite build" },
        dependencies: { "xml-model": `file:${tarball}` },
        devDependencies: {
          vite: peerDependencies.vite,
          typescript: peerDependencies.typescript,
          tslib: peerDependencies.tslib,
          "@rollup/plugin-typescript": peerDependencies["@rollup/plugin-typescript"],
        },
      }),
    );
    await mkdir(resolve(tmp.path, "src"));

    writeFileSync(
      resolve(tmp.path, "src", "index.ts"),
      `import { Model } from "xml-model";

@Model({
  fromXML(ctx) {
    const instance = new MyClass();
    if (ctx.properties.foo) instance.foo = ctx.properties.foo;
    return instance;
  },
})
export class MyClass {
  foo = "bar";
}
`,
    );

    writeFileSync(
      resolve(tmp.path, "src", "test.ts"),
      `import { getModel, XML } from "xml-model";
import { MyClass } from ".";

const model = getModel(MyClass);
const a: MyClass = model.fromXML("<my-class><foo>test</foo></my-class>");
console.log(JSON.stringify(a));
const b = new MyClass();
console.log(XML.stringify(model.toXML(b)));
`,
    );

    writeFileSync(
      resolve(tmp.path, "vite.config.ts"),
      `import { defineConfig } from "vite";
import XMLModelVitePlugin from "xml-model/vite";

export default defineConfig({
  plugins: [XMLModelVitePlugin()],
  build: {
    minify: true,
    lib: {
      entry: { index: "./src/index.ts", test: "./src/test.ts" },
      formats: ["es"],
    },
  },
});
`,
    );

    await exec("npm install", { cwd: tmp.path });
    await exec("npm run build", { cwd: tmp.path });
  }, 120_000);

  test("library works as intended with minification", async () => {
    expect((await exec(`node ${resolve(tmp.path, "dist", "test.js")}`)).stdout).toBe(
      `{"foo":"test"}
<my-class><foo>bar</foo></my-class>
`,
    );
  });
});
