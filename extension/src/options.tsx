import { createRoot } from "react-dom/client";
import { Options } from "./options/Options";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<Options />);
}
