// Hot-pink ribbon shown on every screen when the build was made with
// `vite --mode staging` (or any future env where VITE_ENV != "production").
// The whole point: make it impossible for a tester to forget which
// environment they're poking at, so they don't, for example, "approve
// disconnections" against the real co-op members.

const ENV = import.meta.env.VITE_ENV || "";

export default function StagingBanner() {
  if (!ENV || ENV === "production") return null;

  const label = ENV === "staging" ? "STAGING" : ENV.toUpperCase();
  const color = ENV === "staging" ? "bg-pink-600" : "bg-amber-500";

  return (
    <div className={`${color} text-white text-xs font-bold uppercase tracking-widest text-center py-1 px-2 sticky top-0 z-[200] shadow-md`}>
      {label} environment · test data only · changes do not affect production
    </div>
  );
}
