const { execFileSync } = require("node:child_process");
const { rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

module.exports = async function notarizeApp(context) {
  const profile = process.env.NOTARY_PROFILE;
  if (!profile) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${appName}.app`);
  const archive = join(tmpdir(), `contentdeck-notary-${process.pid}.zip`);
  rmSync(archive, { force: true });
  try {
    execFileSync("ditto", ["-c", "-k", "--keepParent", appPath, archive], {
      stdio: "inherit",
    });
    execFileSync(
      "xcrun",
      ["notarytool", "submit", archive, "--keychain-profile", profile, "--wait"],
      { stdio: "inherit" },
    );
    execFileSync("xcrun", ["stapler", "staple", appPath], { stdio: "inherit" });
    execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
      stdio: "inherit",
    });
  } finally {
    rmSync(archive, { force: true });
  }
};
