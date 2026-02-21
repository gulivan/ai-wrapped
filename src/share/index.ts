import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import SharePage from "./SharePage";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(createElement(SharePage));
}
