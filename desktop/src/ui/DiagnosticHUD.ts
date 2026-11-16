import {
  AvatarInteractionState,
  PersonaId,
  resolveModelPath,
} from "../avatar/ReactiveVRMController.js";

export interface TelemetryData {
  state: AvatarInteractionState;
  persona: PersonaId;
  detail?: string;
  crossfadeDurationMs: number;
  autoResetRemainingMs?: number;
  bridgeOnline: boolean;
}

export type ActionCallback = (action: string, payload?: unknown) => void;

/**
 * Sleek, glassmorphic telemetry HUD and simulation dashboard for desktop companion.
 * Toggled via 'D' key, ?debug=1 URL query parameter, or badge click.
 */
export class DiagnosticHUD {
  private _root: HTMLDivElement;
  private _badge: HTMLDivElement;
  private _panel: HTMLDivElement;
  private _isVisible = false;
  private _bridgeOnline = false;
  private _onAction: ActionCallback | null = null;

  // DOM telemetry elements
  private _bridgeStatusEl!: HTMLSpanElement;
  private _stateBadgeEl!: HTMLSpanElement;
  private _personaBadgeEl!: HTMLSpanElement;
  private _modelEl!: HTMLSpanElement;
  private _crossfadeEl!: HTMLSpanElement;
  private _detailEl!: HTMLSpanElement;
  private _cooldownEl!: HTMLSpanElement;

  private _currentState: AvatarInteractionState = "idle";
  private _currentPersona: PersonaId = "eli";
  private _crossfadeMs = 250;
  private _activeDetail = "initial";
  private _cooldownRemaining = 0; // seconds

  constructor(onAction?: ActionCallback) {
    this._onAction = onAction ?? null;

    this._root = document.createElement("div");
    this._root.id = "diagnostic-hud-root";
    this._root.style.position = "absolute";
    this._root.style.top = "8px";
    this._root.style.left = "8px";
    this._root.style.zIndex = "99999";
    this._root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    this._root.style.fontSize = "11px";
    this._root.style.userSelect = "none";
    this._root.style.pointerEvents = "auto";

    // Unobtrusive toggle badge
    this._badge = document.createElement("div");
    this._badge.innerHTML = "⚡ HUD <span style='opacity:0.6;font-size:9px;'>[D]</span>";
    this._badge.style.padding = "3px 8px";
    this._badge.style.background = "rgba(15, 23, 42, 0.75)";
    this._badge.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    this._badge.style.borderRadius = "6px";
    this._badge.style.color = "#94a3b8";
    this._badge.style.cursor = "pointer";
    this._badge.style.backdropFilter = "blur(8px)";
    this._badge.style.display = "inline-block";
    this._badge.style.marginBottom = "6px";
    this._badge.setAttribute("data-tauri-drag-region", "false");

    this._badge.addEventListener("click", () => this.toggle());

    // Main telemetry & simulation panel
    this._panel = document.createElement("div");
    this._panel.style.display = "none";
    this._panel.style.width = "300px";
    this._panel.style.background = "rgba(15, 23, 42, 0.92)";
    this._panel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
    this._panel.style.borderRadius = "10px";
    this._panel.style.padding = "10px 12px";
    this._panel.style.color = "#f8fafc";
    this._panel.style.backdropFilter = "blur(14px)";
    this._panel.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.5)";
    this._panel.setAttribute("data-tauri-drag-region", "false");

    this._buildPanelContent();

    this._root.appendChild(this._badge);
    this._root.appendChild(this._panel);
    document.body.appendChild(this._root);

    // Global toggle keybinding ('D' or 'd')
    window.addEventListener("keydown", (e) => {
      if (e.key === "d" || e.key === "D") {
        this.toggle();
      }
    });

    // Auto-open if ?debug=1 URL query present
    try {
      if (window.location.search.includes("debug=1")) {
        this.show();
      }
    } catch {}
  }

  public get isBridgeOnline(): boolean {
    return this._bridgeOnline;
  }

  public toggle(): void {
    if (this._isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public show(): void {
    this._isVisible = true;
    this._panel.style.display = "block";
    this._badge.style.color = "#38bdf8";
    this._badge.style.borderColor = "#38bdf8";
  }

  public hide(): void {
    this._isVisible = false;
    this._panel.style.display = "none";
    this._badge.style.color = "#94a3b8";
    this._badge.style.borderColor = "rgba(255, 255, 255, 0.15)";
  }

  public setBridgeOnline(online: boolean): void {
    this._bridgeOnline = online;
    if (this._bridgeStatusEl) {
      this._bridgeStatusEl.textContent = online ? "ONLINE (39420)" : "OFFLINE (SIM)";
      this._bridgeStatusEl.style.color = online ? "#4ade80" : "#fbbf24";
    }
  }

  public updateTelemetry(
    payload: {
      state: AvatarInteractionState;
      persona?: PersonaId;
      detail?: string;
    },
    isBridgeOnline = true
  ): void {
    this._currentState = payload.state;
    if (payload.persona) {
      this._currentPersona = payload.persona;
    }
    this._activeDetail = payload.detail ?? "none";
    this._crossfadeMs = payload.state === "error" ? 150 : 250;

    if (payload.state === "success") {
      this._cooldownRemaining = 2.0;
    } else if (payload.state === "error") {
      this._cooldownRemaining = 2.5;
    } else {
      this._cooldownRemaining = 0;
    }

    this.setBridgeOnline(isBridgeOnline);
    this._refreshView();
  }

  public updatePersona(persona: PersonaId, modelPath: string, reloaded: boolean): void {
    this._currentPersona = persona;
    if (this._personaBadgeEl) {
      this._personaBadgeEl.textContent = persona.toUpperCase();
    }
    if (this._modelEl) {
      const fileName = modelPath.split("/").pop() ?? modelPath;
      this._modelEl.textContent = `${fileName} ${reloaded ? "(mesh reloaded)" : "(in-place)"}`;
    }
  }

  public update(deltaTime: number): void {
    if (this._cooldownRemaining > 0) {
      this._cooldownRemaining = Math.max(0, this._cooldownRemaining - deltaTime);
      if (this._cooldownEl) {
        this._cooldownEl.textContent = `${this._cooldownRemaining.toFixed(1)}s`;
      }
    } else if (this._cooldownEl && this._cooldownEl.textContent !== "-") {
      this._cooldownEl.textContent = "-";
    }
  }

  private _refreshView(): void {
    if (!this._stateBadgeEl) return;

    this._stateBadgeEl.textContent = this._currentState.toUpperCase();
    this._stateBadgeEl.style.background = this._getStateColor(this._currentState);

    this._personaBadgeEl.textContent = this._currentPersona.toUpperCase();
    const model = resolveModelPath(this._currentPersona).split("/").pop() ?? "";
    this._modelEl.textContent = model;

    this._crossfadeEl.textContent = `${this._crossfadeMs}ms`;
    this._detailEl.textContent = this._activeDetail;
  }

  private _getStateColor(state: AvatarInteractionState): string {
    switch (state) {
      case "idle":
        return "#475569";
      case "thinking":
        return "#0284c7";
      case "speaking":
        return "#9333ea";
      case "executing":
        return "#d97706";
      case "success":
        return "#16a34a";
      case "error":
        return "#dc2626";
      default:
        return "#475569";
    }
  }

  private _buildPanelContent(): void {
    // Header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "8px";
    header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";
    header.style.paddingBottom = "4px";

    const title = document.createElement("span");
    title.style.fontWeight = "bold";
    title.style.color = "#38bdf8";
    title.textContent = "DIAGNOSTIC HUD";

    this._bridgeStatusEl = document.createElement("span");
    this._bridgeStatusEl.style.fontSize = "9px";
    this._bridgeStatusEl.style.color = "#fbbf24";
    this._bridgeStatusEl.textContent = "OFFLINE (SIM)";

    header.appendChild(title);
    header.appendChild(this._bridgeStatusEl);
    this._panel.appendChild(header);

    // Telemetry Grid
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "70px 1fr";
    grid.style.rowGap = "4px";
    grid.style.marginBottom = "10px";

    const addRow = (label: string): HTMLSpanElement => {
      const lbl = document.createElement("span");
      lbl.style.color = "#94a3b8";
      lbl.textContent = label + ":";
      const val = document.createElement("span");
      val.style.color = "#f8fafc";
      grid.appendChild(lbl);
      grid.appendChild(val);
      return val;
    };

    this._stateBadgeEl = addRow("State");
    this._stateBadgeEl.style.padding = "1px 6px";
    this._stateBadgeEl.style.borderRadius = "4px";
    this._stateBadgeEl.style.fontWeight = "bold";
    this._stateBadgeEl.style.display = "inline-block";

    this._personaBadgeEl = addRow("Persona");
    this._modelEl = addRow("Model");
    this._crossfadeEl = addRow("Crossfade");
    this._detailEl = addRow("Detail");
    this._detailEl.style.wordBreak = "break-all";
    this._detailEl.style.color = "#cbd5e1";
    this._cooldownEl = addRow("Cooldown");

    this._panel.appendChild(grid);

    // Section 1: Black-Box Simulation Triggers
    const simTitle = document.createElement("div");
    simTitle.style.color = "#38bdf8";
    simTitle.style.fontSize = "10px";
    simTitle.style.fontWeight = "bold";
    simTitle.style.marginBottom = "4px";
    simTitle.textContent = "THESIS SIMULATION SUITE (BB-01..07)";
    this._panel.appendChild(simTitle);

    const btnGrid = document.createElement("div");
    btnGrid.style.display = "grid";
    btnGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
    btnGrid.style.gap = "4px";
    btnGrid.style.marginBottom = "8px";

    const makeBtn = (text: string, actionKey: string): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = text;
      b.style.background = "rgba(30, 41, 59, 0.8)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.15)";
      b.style.borderRadius = "4px";
      b.style.color = "#f1f5f9";
      b.style.fontSize = "9px";
      b.style.padding = "3px 4px";
      b.style.cursor = "pointer";
      b.setAttribute("data-tauri-drag-region", "false");

      b.addEventListener("mouseenter", () => {
        b.style.borderColor = "#38bdf8";
      });
      b.addEventListener("mouseleave", () => {
        b.style.borderColor = "rgba(255, 255, 255, 0.15)";
      });
      b.addEventListener("click", () => {
        this._onAction?.(actionKey);
      });
      return b;
    };

    btnGrid.appendChild(makeBtn("BB-01: Idle State", "BB-01"));
    btnGrid.appendChild(makeBtn("BB-02: Think (250ms)", "BB-02"));
    btnGrid.appendChild(makeBtn("BB-03: Speak (Dwell)", "BB-03"));
    btnGrid.appendChild(makeBtn("BB-04: Tool Cycle", "BB-04"));
    btnGrid.appendChild(makeBtn("BB-05: Success (2s)", "BB-05"));
    btnGrid.appendChild(makeBtn("BB-06: Error (150ms)", "BB-06"));
    btnGrid.appendChild(makeBtn("BB-07: Preempt (10ms)", "BB-07"));
    btnGrid.appendChild(makeBtn("Reset Runtime", "RESET"));

    this._panel.appendChild(btnGrid);

    // Section 2: Persona Swapping Controls
    const personaTitle = document.createElement("div");
    personaTitle.style.color = "#38bdf8";
    personaTitle.style.fontSize = "10px";
    personaTitle.style.fontWeight = "bold";
    personaTitle.style.marginBottom = "4px";
    personaTitle.textContent = "PERSONA SWAP (IN-PLACE vs MESH RELOAD)";
    this._panel.appendChild(personaTitle);

    const personaRow = document.createElement("div");
    personaRow.style.display = "flex";
    personaRow.style.gap = "4px";

    const makePersonaBtn = (p: PersonaId): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = p.toUpperCase();
      b.style.flex = "1";
      b.style.background = "rgba(30, 41, 59, 0.8)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.15)";
      b.style.borderRadius = "4px";
      b.style.color = "#f1f5f9";
      b.style.fontSize = "9px";
      b.style.padding = "3px 0";
      b.style.cursor = "pointer";
      b.setAttribute("data-tauri-drag-region", "false");
      b.addEventListener("click", () => {
        this._onAction?.("SET_PERSONA", p);
      });
      return b;
    };

    personaRow.appendChild(makePersonaBtn("eli"));
    personaRow.appendChild(makePersonaBtn("rei"));
    personaRow.appendChild(makePersonaBtn("sora"));
    personaRow.appendChild(makePersonaBtn("rin"));

    this._panel.appendChild(personaRow);
    this._refreshView();
  }
}
