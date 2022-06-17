try {
  require("ts-node").register({
    project: "./tsconfig.json",
    compiler: "ttypescript",
  });
} catch (error) {
  console.log("[ERROR] " + error.message);
  process.exit(1);
}
