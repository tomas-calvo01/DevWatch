// monitor/config.js
// Lectura de variables de entorno numéricas del Motor de Monitoreo.
// Si la variable no existe o no es un entero positivo, se usa el valor por defecto.
export function leerEnteroPositivo(nombre, porDefecto) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === "") return porDefecto;

  const valor = Number(crudo);
  if (!Number.isInteger(valor) || valor <= 0) {
    console.warn(`[monitor] ${nombre}="${crudo}" no es un entero positivo; se usa ${porDefecto}.`);
    return porDefecto;
  }
  return valor;
}
