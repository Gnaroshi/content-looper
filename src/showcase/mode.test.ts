import assert from "node:assert/strict";
import test from "node:test";
import { isShowcaseMode } from "./mode";

test("normal execution never loads showcase fixtures", () => assert.equal(isShowcaseMode({}), false));
test("the explicit showcase flag enables fixtures", () => assert.equal(isShowcaseMode({ VITE_GNAROSHI_SHOWCASE: "1" }), true));
