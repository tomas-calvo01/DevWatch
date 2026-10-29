// Cálculos del tablero. Cada uno parte del cronograma de GitHub Projects (y los riesgos del Acta).
// Fechas en texto AAAA-MM-DD; "hoy" es la fecha local de quien abre el tablero.

dash.calc('plan', {
  inputs: ['cronograma'],
  title: 'Ruta crítica y holguras del plan',
  description: 'Método de la ruta crítica sobre las fechas y predecesoras planificadas: inicio y fin más tarde y holgura total de cada tarea.',
  fn: (cronograma) => {
    const DIA = 864e5;
    const t = (s) => Date.parse(s + 'T00:00:00Z');
    const f = (ms) => new Date(ms).toISOString().slice(0, 10);
    const tareas = cronograma.map((r) => ({
      ...r,
      dur: (t(r.fin) - t(r.inicio)) / DIA + 1,
      preds: String(r.predecesoras || '').split(',').map((p) => p.trim()).filter(Boolean),
    }));
    const porId = new Map(tareas.map((x) => [x.id, x]));
    const orden = [];
    const vistas = new Set();
    const visitar = (x) => {
      if (vistas.has(x.id)) return;
      vistas.add(x.id);
      x.preds.forEach((p) => porId.has(p) && visitar(porId.get(p)));
      orden.push(x);
    };
    tareas.forEach(visitar);
    for (const x of orden) {
      x.es = Math.max(0, ...x.preds.filter((p) => porId.has(p)).map((p) => porId.get(p).ef));
      x.ef = x.es + x.dur;
    }
    const duracion = Math.max(...tareas.map((x) => x.ef));
    for (const x of [...orden].reverse()) {
      const sucesoras = tareas.filter((s) => s.preds.includes(x.id));
      x.lf = Math.min(duracion, ...sucesoras.map((s) => s.ls));
      x.ls = x.lf - x.dur;
    }
    const inicio = Math.min(...tareas.map((x) => t(x.inicio)));
    return orden
      .sort((a, b) => a.es - b.es || a.id.localeCompare(b.id, 'en', { numeric: true }))
      .map((x) => ({
        id: x.id,
        tarea: x.tarea,
        estado: x.estado,
        hito: x.hito,
        inicio: x.inicio,
        fin: x.fin,
        dias: x.dur,
        costo_usd: x.costo_usd,
        horas: x.horas,
        holgura_dias: x.ls - x.es,
        critica: x.ls === x.es ? 'Sí' : 'No',
        inicio_mas_tarde: f(inicio + x.ls * DIA),
        fin_mas_tarde: f(inicio + (x.lf - 1) * DIA),
      }));
  },
});

dash.calc('avance', {
  inputs: ['cronograma'],
  title: 'Avance y valor ganado a hoy',
  description: 'Valor ganado = costo de las tareas en Done; valor planificado = costo que el plan preveía consumido hasta ayer (prorrateado por día); SPI = ganado ÷ planificado.',
  fn: (cronograma) => {
    const DIA = 864e5;
    const t = (s) => Date.parse(s + 'T00:00:00Z');
    const ahora = new Date();
    const hoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const suma = (rows, k) => rows.reduce((a, r) => a + Number(r[k]), 0);
    const hechas = cronograma.filter((r) => r.estado === 'Done');
    const presupuesto = suma(cronograma, 'costo_usd');
    const ganado = suma(hechas, 'costo_usd');
    const planificado = cronograma.reduce((a, r) => {
      const dur = (t(r.fin) - t(r.inicio)) / DIA + 1;
      const transcurrido = Math.min(Math.max((hoy - t(r.inicio)) / DIA / dur, 0), 1);
      return a + r.costo_usd * transcurrido;
    }, 0);
    return [{
      hoy: new Date(hoy).toISOString().slice(0, 10),
      presupuesto_usd: presupuesto,
      valor_ganado_usd: ganado,
      valor_planificado_usd: Math.round(planificado * 100) / 100,
      avance: ganado / presupuesto,
      avance_planificado: planificado / presupuesto,
      spi: planificado > 0 ? ganado / planificado : null,
      desvio_usd: Math.round((ganado - planificado) * 100) / 100,
      pendiente_usd: presupuesto - ganado,
      horas_totales: suma(cronograma, 'horas'),
      horas_hechas: suma(hechas, 'horas'),
      horas_pendientes: suma(cronograma, 'horas') - suma(hechas, 'horas'),
      tareas_hechas: hechas.length,
      tareas_totales: cronograma.length,
    }];
  },
});

dash.calc('curva', {
  inputs: ['cronograma'],
  title: 'Curva S planificada',
  description: 'Costo acumulado que el plan prevé consumido al cierre de cada día, del inicio al fin del proyecto.',
  fn: (cronograma) => {
    const DIA = 864e5;
    const t = (s) => Date.parse(s + 'T00:00:00Z');
    const desde = Math.min(...cronograma.map((r) => t(r.inicio)));
    const hasta = Math.max(...cronograma.map((r) => t(r.fin)));
    const presupuesto = cronograma.reduce((a, r) => a + r.costo_usd, 0);
    const filas = [];
    for (let d = desde; d <= hasta; d += DIA) {
      const pv = cronograma.reduce((a, r) => {
        const dur = (t(r.fin) - t(r.inicio)) / DIA + 1;
        return a + r.costo_usd * Math.min(Math.max((d - t(r.inicio)) / DIA + 1, 0) / dur, 1);
      }, 0);
      filas.push({ fecha: new Date(d).toISOString().slice(0, 10), planificado_usd: Math.round(pv * 100) / 100, avance_planificado: pv / presupuesto });
    }
    return filas;
  },
});

dash.calc('hitos', {
  inputs: ['cronograma'],
  title: 'Avance por hito',
  description: 'Costo total y costo de tareas en Done de cada hito.',
  fn: (cronograma) => {
    const hitos = [...new Set(cronograma.map((r) => r.hito))].sort();
    return hitos.map((hito) => {
      const rows = cronograma.filter((r) => r.hito === hito);
      const total = rows.reduce((a, r) => a + r.costo_usd, 0);
      const hecho = rows.filter((r) => r.estado === 'Done').reduce((a, r) => a + r.costo_usd, 0);
      return {
        hito,
        tareas: rows.length,
        tareas_hechas: rows.filter((r) => r.estado === 'Done').length,
        costo_usd: total,
        hecho_usd: hecho,
        avance: hecho / total,
        fin: rows.map((r) => r.fin).sort().at(-1),
      };
    });
  },
});

dash.calc('pronostico', {
  inputs: ['cronograma'],
  title: 'Replanificación desde hoy',
  description: 'Las tareas en Done se toman como terminadas; cada pendiente arranca hoy o cuando terminan sus predecesoras. La holgura es cuánto puede postergarse sin pasar la fecha de fin del plan.',
  fn: (cronograma) => {
    const DIA = 864e5;
    const t = (s) => Date.parse(s + 'T00:00:00Z');
    const f = (ms) => new Date(ms).toISOString().slice(0, 10);
    const ahora = new Date();
    const hoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const tareas = cronograma.map((r) => ({
      ...r,
      dur: (t(r.fin) - t(r.inicio)) / DIA + 1,
      preds: String(r.predecesoras || '').split(',').map((p) => p.trim()).filter(Boolean),
    }));
    const porId = new Map(tareas.map((x) => [x.id, x]));
    const orden = [];
    const vistas = new Set();
    const visitar = (x) => {
      if (vistas.has(x.id)) return;
      vistas.add(x.id);
      x.preds.forEach((p) => porId.has(p) && visitar(porId.get(p)));
      orden.push(x);
    };
    tareas.forEach(visitar);
    for (const x of orden) {
      if (x.estado === 'Done') {
        x.ef = Math.min(t(x.fin) + DIA, hoy);
        continue;
      }
      x.es = Math.max(hoy, ...x.preds.filter((p) => porId.has(p)).map((p) => porId.get(p).ef));
      x.ef = x.es + x.dur * DIA;
    }
    const limite = Math.max(...tareas.map((x) => t(x.fin))) + DIA;
    const pendientes = orden.filter((x) => x.estado !== 'Done');
    for (const x of [...pendientes].reverse()) {
      const sucesoras = pendientes.filter((s) => s.preds.includes(x.id));
      x.lf = Math.min(limite, ...sucesoras.map((s) => s.ls));
      x.ls = x.lf - x.dur * DIA;
    }
    return pendientes
      .sort((a, b) => a.es - b.es || a.id.localeCompare(b.id, 'en', { numeric: true }))
      .map((x) => ({
        id: x.id,
        tarea: x.tarea,
        inicio_plan: x.inicio,
        fin_plan: x.fin,
        inicio_posible: f(x.es),
        fin_posible: f(x.ef - DIA),
        inicio_mas_tarde: f(x.ls),
        holgura_dias: Math.round((x.ls - x.es) / DIA),
        fin_limite: f(limite - DIA),
      }));
  },
});

dash.calc('resumen', {
  inputs: ['pronostico'],
  title: 'Fin estimado y margen',
  description: 'Fin estimado si lo pendiente arranca apenas se puede, comparado con la fecha de fin del plan.',
  fn: (pronostico) => {
    if (pronostico.length === 0) return [{ fin_estimado: null, fin_limite: null, margen_dias: null, margen_semanas: null, tareas_pendientes: 0, sin_holgura: '' }];
    const t = (s) => Date.parse(s + 'T00:00:00Z');
    const fin = pronostico.map((r) => r.fin_posible).sort().at(-1);
    const limite = pronostico[0].fin_limite;
    const minima = Math.min(...pronostico.map((r) => r.holgura_dias));
    return [{
      fin_estimado: fin,
      fin_limite: limite,
      margen_dias: Math.round((t(limite) - t(fin)) / 864e5),
      margen_semanas: Math.max(0, Math.floor(Math.round((t(limite) - t(fin)) / 864e5) / 7)),
      tareas_pendientes: pronostico.length,
      sin_holgura: pronostico.filter((r) => r.holgura_dias === minima).map((r) => r.id).join(', '),
    }];
  },
});

dash.calc('escenarios', {
  inputs: ['cronograma'],
  title: 'Escenarios de postergación',
  description: 'Fin del proyecto si se posterga todo lo pendiente, o una sola tarea, de 0 a 6 semanas, contra la fecha de fin del plan.',
  fn: (cronograma) => {
    const DIA = 864e5;
    const t = (s) => Date.parse(s + 'T00:00:00Z');
    const f = (ms) => new Date(ms).toISOString().slice(0, 10);
    const ahora = new Date();
    const hoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const tareas = cronograma.map((r) => ({
      ...r,
      dur: (t(r.fin) - t(r.inicio)) / DIA + 1,
      preds: String(r.predecesoras || '').split(',').map((p) => p.trim()).filter(Boolean),
    }));
    const porId = new Map(tareas.map((x) => [x.id, x]));
    const orden = [];
    const vistas = new Set();
    const visitar = (x) => {
      if (vistas.has(x.id)) return;
      vistas.add(x.id);
      x.preds.forEach((p) => porId.has(p) && visitar(porId.get(p)));
      orden.push(x);
    };
    tareas.forEach(visitar);
    const limite = Math.max(...tareas.map((x) => t(x.fin)));
    // Fin del proyecto si "opcion" ("todo" o el id de una tarea) se corre "dias" días.
    const fin = (opcion, dias) => {
      const ef = new Map();
      const base = opcion === 'todo' ? hoy + dias * DIA : hoy;
      for (const x of orden) {
        if (x.estado === 'Done') {
          ef.set(x.id, Math.min(t(x.fin) + DIA, hoy));
          continue;
        }
        let es = Math.max(base, ...x.preds.filter((p) => ef.has(p)).map((p) => ef.get(p)));
        if (x.id === opcion) es += dias * DIA;
        ef.set(x.id, es + x.dur * DIA);
      }
      return Math.max(...ef.values()) - DIA;
    };
    const opciones = ['todo', ...orden.filter((x) => x.estado !== 'Done').map((x) => x.id)];
    const filas = [];
    for (const opcion of opciones) {
      for (let semanas = 0; semanas <= 6; semanas++) {
        const f_ms = fin(opcion, semanas * 7);
        const exceso = Math.round((f_ms - limite) / DIA);
        filas.push({
          opcion,
          semanas,
          fin_proyecto: f(f_ms),
          fin_limite: f(limite),
          dias_sobre_limite: exceso,
          viable: exceso <= 0 ? 'Sí' : 'No',
        });
      }
    }
    return filas;
  },
});

dash.calc('riesgos_eval', {
  inputs: ['riesgos', 'cronograma'],
  title: 'Exposición de riesgos',
  description: 'Probabilidad e impacto en escala 1–3 (Baja/Media/Alta, Bajo/Medio/Alto); exposición = probabilidad × impacto; un riesgo sigue expuesto mientras alguna de sus tareas esté pendiente.',
  fn: (riesgos, cronograma) => {
    const escala = { Baja: 1, Bajo: 1, Media: 2, Medio: 2, Alta: 3, Alto: 3 };
    const pendientes = cronograma.filter((r) => r.estado !== 'Done').map((r) => r.id);
    return riesgos.map((r) => {
      const p = escala[r.probabilidad] ?? 0;
      const i = escala[r.impacto] ?? 0;
      const tareas = String(r.tareas).trim() === '*' ? pendientes : String(r.tareas).split(',').map((x) => x.trim()).filter((x) => pendientes.includes(x));
      return {
        id: r.id,
        riesgo: r.riesgo,
        probabilidad: r.probabilidad,
        impacto: r.impacto,
        prob_n: p,
        impacto_n: i,
        exposicion: p * i,
        nivel: p * i >= 6 ? 'Alto' : p * i >= 3 ? 'Medio' : 'Bajo',
        mitigacion: r.mitigacion,
        tareas_pendientes: tareas.join(', '),
        estado: tareas.length > 0 ? 'Expuesto' : 'Sin tareas pendientes',
      };
    }).sort((a, b) => b.exposicion - a.exposicion || a.id.localeCompare(b.id));
  },
});
