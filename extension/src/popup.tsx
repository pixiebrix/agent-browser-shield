// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { createRoot } from "react-dom/client";
import { Popup } from "./popup/Popup";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<Popup />);
}
