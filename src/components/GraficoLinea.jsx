import { useState } from "react";

/**
 * Gráfico de línea en SVG propio, sin librerías. Lo usa el Dashboard
 * (actividad 2.3) para el tiempo de respuesta promedio del período.
 *
 * - `puntos`: [{ etiqueta, valor }] en orden; `valor` null deja un hueco
 *   en la línea (tramo sin datos).
 * - `unidad`: texto que acompaña a los valores (por ejemplo "ms").
 * - `descripcion`: texto alternativo para lectores de pantalla.
 *
 * Al pasar el mouse (o tocar) se muestra el valor exacto de cada punto.
 * Los colores salen de las variables de App.css.
 */
const ANCHO = 720;
const ALTO = 260;
const MARGEN = { arriba: 28, derecha: 20, abajo: 32, izquierda: 60 };
const ANCHO_AREA = ANCHO - MARGEN.izquierda - MARGEN.derecha;
const ALTO_AREA = ALTO - MARGEN.arriba - MARGEN.abajo;
const MARCAS_EJE_Y = 4;
const MAX_ETIQUETAS_EJE_X = 8;

// Paso "redondo" (1, 2 o 5 × 10ⁿ) para que las marcas del eje Y se lean fácil.
function pasoDelEje(maximo) {
  const bruto = maximo / MARCAS_EJE_Y;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 5, 10].find((base) => base * magnitud >= bruto) * magnitud;
}

function formatear(valor, unidad) {
  return `${valor.toLocaleString("es-AR")} ${unidad}`;
}

export default function GraficoLinea({ puntos, unidad = "", descripcion }) {
  const [activo, setActivo] = useState(null);

  const valores = puntos.filter((p) => p.valor !== null).map((p) => p.valor);
  if (valores.length === 0) {
    return <p className="tabla-vacia">No hay datos para graficar en este período.</p>;
  }

  const paso = pasoDelEje(Math.max(...valores, 1));
  const tope = Math.ceil(Math.max(...valores, 1) / paso) * paso;
  const marcas = [];
  for (let v = 0; v <= tope; v += paso) marcas.push(v);

  const separacion = puntos.length > 1 ? ANCHO_AREA / (puntos.length - 1) : ANCHO_AREA;
  const x = (i) => MARGEN.izquierda + (puntos.length > 1 ? i * separacion : ANCHO_AREA / 2);
  const y = (valor) => MARGEN.arriba + ALTO_AREA * (1 - valor / tope);

  // La línea se corta en los tramos sin datos.
  let trazo = "";
  puntos.forEach((p, i) => {
    if (p.valor === null) return;
    const sigue = i > 0 && puntos[i - 1].valor !== null;
    trazo += `${sigue ? "L" : "M"}${x(i)},${y(p.valor)}`;
  });

  const cadaCuantas = Math.ceil(puntos.length / MAX_ETIQUETAS_EJE_X);
  const puntoActivo = activo !== null ? puntos[activo] : null;

  let tooltip = null;
  if (puntoActivo) {
    const texto =
      puntoActivo.valor !== null
        ? `${puntoActivo.etiqueta}: ${formatear(puntoActivo.valor, unidad)}`
        : `${puntoActivo.etiqueta}: sin datos`;
    const ancho = texto.length * 6.6 + 16;
    const izquierda = Math.min(
      Math.max(x(activo) - ancho / 2, MARGEN.izquierda),
      ANCHO - MARGEN.derecha - ancho,
    );
    tooltip = { texto, ancho, izquierda };
  }

  return (
    <div className="grafico">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={descripcion}
        onMouseLeave={() => setActivo(null)}
      >
        {marcas.map((marca) => (
          <g key={marca} className="grafico-eje">
            <line
              className="grafico-grilla"
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(marca)}
              y2={y(marca)}
            />
            <text x={MARGEN.izquierda - 8} y={y(marca)} textAnchor="end" dominantBaseline="middle">
              {formatear(marca, unidad)}
            </text>
          </g>
        ))}

        <g className="grafico-eje">
          {puntos.map(
            (p, i) =>
              i % cadaCuantas === 0 && (
                <text key={i} x={x(i)} y={ALTO - MARGEN.abajo + 20} textAnchor="middle">
                  {p.etiqueta}
                </text>
              ),
          )}
        </g>

        {puntoActivo && (
          <line
            className="grafico-cursor"
            x1={x(activo)}
            x2={x(activo)}
            y1={MARGEN.arriba}
            y2={MARGEN.arriba + ALTO_AREA}
          />
        )}

        <path className="grafico-linea" d={trazo} />
        {puntos.map(
          (p, i) =>
            p.valor !== null && (
              <circle
                key={i}
                className="grafico-punto"
                cx={x(i)}
                cy={y(p.valor)}
                r={i === activo ? 6 : 4}
              />
            ),
        )}

        {tooltip && (
          <g className="grafico-tooltip">
            <rect x={tooltip.izquierda} y={2} width={tooltip.ancho} height={22} rx={4} />
            <text x={tooltip.izquierda + tooltip.ancho / 2} y={13} textAnchor="middle" dominantBaseline="middle">
              {tooltip.texto}
            </text>
          </g>
        )}

        {/* Franjas invisibles, más anchas que el punto, para detectar el mouse. */}
        {puntos.map((p, i) => (
          <rect
            key={i}
            x={x(i) - separacion / 2}
            y={MARGEN.arriba}
            width={separacion}
            height={ALTO_AREA}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
            onClick={() => setActivo(i)}
          />
        ))}
      </svg>
    </div>
  );
}
