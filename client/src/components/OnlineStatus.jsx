// Global online/offline banner. Mounted once at the app root. Stays out of
// the way when online; shows a slim red bar at the top of the viewport when
// the device drops offline so the user knows actions that need the API
// won't go through. The PWA shell + IndexedDB still keep the app usable.
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OnlineStatus() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow"
    >
      <WifiOff size={14} />
      You are offline — cached pages still work; new data will sync when you’re back online.
    </div>
  );
}
