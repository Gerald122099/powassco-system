export default function Card({ children }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4">
      {children}
    </div>
  );
}