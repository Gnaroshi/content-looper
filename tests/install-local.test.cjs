const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const installer = readFileSync(join(__dirname, "../scripts/install_local.sh"), "utf8");

test("local installer creates a self-contained trusted-prefix CLI", () => {
  assert.match(installer, /npm|\$NPM/);
  assert.match(installer, /pack --pack-destination/);
  assert.match(installer, /install --global --prefix "\$HOME\/\.local" "\$PACKAGE_DIR\/\$PACKAGE_NAME"/);
  assert.match(installer, /realpath "\$HOME\/\.local\/bin\/contentdeck"/);
  assert.doesNotMatch(installer, /install --global --prefix "\$HOME\/\.local" "\$ROOT"/);
});
