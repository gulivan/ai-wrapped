import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { electroview } from "./hooks/useRPC";

void electroview;

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(createElement(App));
}
