// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { Outlet } from "react-router-dom";
import ChatWidget from "./components/ChatWidget";
import CookieBanner from "./components/CookieBanner";
import Footer from "./components/Footer";
import Header from "./components/Header";
import NewsletterModal from "./components/NewsletterModal";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
      <NewsletterModal />
      <ChatWidget />
    </div>
  );
}
