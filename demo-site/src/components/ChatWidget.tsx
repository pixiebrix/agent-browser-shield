export default function ChatWidget() {
  return (
    <div
      id="intercom-container"
      className="fixed bottom-6 right-6 z-40"
      style={{ position: "fixed" }}
    >
      <button
        type="button"
        aria-label="Open chat"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path d="M12 2C6.48 2 2 6.04 2 11c0 2.55 1.18 4.83 3.07 6.41L4 22l4.93-1.97A11.16 11.16 0 0 0 12 20c5.52 0 10-4.04 10-9s-4.48-9-10-9z" />
        </svg>
      </button>
    </div>
  );
}
