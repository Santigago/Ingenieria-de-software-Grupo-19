"""Gráfico de barras horizontales: tiempo promedio por etapa de la atención en un puesto de comida (con rango estimado)."""
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

SALIDA = sys.argv[1]
ETAPAS = [  # (etapa, mínimo, máximo) en minutos, en el orden del proceso
    ("Espera en la fila", 5, 10),
    ("Registro y cobro en POSONE", 2, 4),
    ("Preparación del pedido", 5, 10),
]
SERIE, TEXTO, TEXTO_2, GRILLA = "#2a78d6", "#0b0b0b", "#52514e", "#e4e3df"

plt.rcParams.update({"font.family": "Arial", "font.size": 11})
fig, ax = plt.subplots(figsize=(7.2, 2.9), dpi=220)
nombres = [e[0] for e in ETAPAS][::-1]
minimos = [e[1] for e in ETAPAS][::-1]
maximos = [e[2] for e in ETAPAS][::-1]
promedios = [(a + b) / 2 for a, b in zip(minimos, maximos)]
y = range(len(ETAPAS))

ax.barh(y, promedios, height=0.42, color=SERIE, zorder=2)
for yi, mn, mx, pr in zip(y, minimos, maximos, promedios):
    ax.plot([mn, mx], [yi, yi], color=TEXTO_2, linewidth=1.6, zorder=3)
    for x in (mn, mx):
        ax.plot([x, x], [yi - 0.09, yi + 0.09], color=TEXTO_2, linewidth=1.6, zorder=3)
    ax.text(mx + 0.25, yi, f"{pr:g} min  (rango {mn}–{mx})".replace(".", ","), va="center", ha="left",
            color=TEXTO, fontsize=10.5)

ax.set_yticks(list(y), nombres, color=TEXTO)
ax.set_xlim(0, 15)
ax.set_xlabel("Minutos por visitante", color=TEXTO_2)
ax.xaxis.grid(True, color=GRILLA, linewidth=0.8, zorder=0)
ax.set_axisbelow(True)
for lado in ("top", "right", "left"):
    ax.spines[lado].set_visible(False)
ax.spines["bottom"].set_color(GRILLA)
ax.tick_params(axis="y", length=0)
ax.tick_params(axis="x", colors=TEXTO_2)
fig.text(0.01, 0.01, "Barra: tiempo promedio estimado. Línea: rango estimado en hora punta.", color=TEXTO_2,
         fontsize=9)
fig.tight_layout(rect=(0, 0.05, 1, 1))
fig.savefig(SALIDA, facecolor="white")
print(SALIDA)
