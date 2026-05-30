// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { createRoot } from "react-dom/client";
import { Options } from "./options/Options";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<Options />);
}
