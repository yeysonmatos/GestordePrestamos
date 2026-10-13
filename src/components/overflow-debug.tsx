import { useEffect, useState } from "react";

/**
 * AVISO TEMPORAL DE DIAGNOSTICO (quitar despues).
 * Muestra el ancho de pantalla vs el ancho real del contenido y lista los
 * elementos que se pasan del borde derecho (para localizar el desborde).
 */
export function OverflowDebug() {
  const [info, setInfo] = useState<{ vw: number; sw: number; culprits: string[] } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function measure() {
      const vw = window.innerWidth;
      const sw = document.documentElement.scrollWidth;
      const culprits: string[] = [];
      const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1) {
          const raw = el.getAttribute("class") || "";
          const cls = raw
            .split(/\s+/)
            .filter((c) => c && !c.startsWith("hover:") && !c.startsWith("focus"))
            .slice(0, 3)
            .join(".");
          culprits.push(
            `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} · ancho ${Math.round(r.width)}px · se pasa ${Math.round(r.right - vw)}px`,
          );
          if (culprits.length >= 4) break;
        }
      }
      setInfo({ vw, sw, culprits });
    }
    measure();
    const t1 = setTimeout(measure, 1200);
    const t2 = setTimeout(measure, 3000);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
    };
  }, []);

  if (hidden || !info) return null;

  return (
    <div className="no-print fixed inset-x-2 bottom-24 z-[60] rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive shadow-lg backdrop-blur lg:inset-x-auto lg:left-72 lg:right-4 lg:bottom-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">Diagnóstico de ancho (temporal)</p>
          <p>
            Pantalla: {info.vw}px · Contenido: {info.sw}px{" "}
            {info.sw > info.vw ? "⚠️ se desborda" : "✓ ok"}
          </p>
          {info.culprits.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {info.culprits.map((c, i) => (
                <li key={i} className="break-all">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 font-medium"
        >
          Ocultar
        </button>
      </div>
    </div>
  );
}
