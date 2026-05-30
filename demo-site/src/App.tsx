import { Outlet } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CookieBanner from "./components/CookieBanner";
import NewsletterModal from "./components/NewsletterModal";
import ChatWidget from "./components/ChatWidget";

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
