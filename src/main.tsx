import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ShowcaseApp } from "./showcase/ShowcaseApp";
import { isShowcaseMode } from "./showcase/mode";
import "./styles.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Root element is missing.");
}

createRoot(root).render(
  <StrictMode>
      {isShowcaseMode(import.meta.env) ? <ShowcaseApp /> : <App />}
  </StrictMode>,
);
