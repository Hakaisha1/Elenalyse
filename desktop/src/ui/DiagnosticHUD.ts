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
    this._root.style.position = "fixed";
    this._root.style.inset = "0";
    this._root.style.zIndex = "99999";
    this._root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    this._root.style.fontSize = "11px";
    this._root.style.userSelect = "none";
    this._root.style.pointerEvents = "none";

    // Unobtrusive toggle badge anchored at top-left corner
    this._badge = document.createElement("div");
    this._badge.innerHTML = "⚡ HUD <span style='opacity:0.6;font-size:9px;'>[D]</span>";
    this._badge.style.position = "fixed";
    this._badge.style.top = "10px";
    this._badge.style.left = "10px";
    this._badge.style.padding = "3px 8px";
    this._badge.style.background = "rgba(15, 23, 42, 0.75)";
    this._badge.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    this._badge.style.borderRadius = "6px";
    this._badge.style.color = "#94a3b8";
    this._badge.style.cursor = "pointer";
    this._badge.style.backdropFilter = "blur(8px)";
    this._badge.style.pointerEvents = "auto";
    this._badge.style.zIndex = "100000";
    this._badge.setAttribute("data-tauri-drag-region", "false");

    this._badge.addEventListener("click", () => this.toggle());

    // Main telemetry & simulation panel - Compact Non-Obstructive Bottom Dock Bar
    this._panel = document.createElement("div");
    this._panel.style.display = "none";
    this._panel.style.position = "fixed";
    this._panel.style.bottom = "0";
    this._panel.style.left = "0";
    this._panel.style.right = "0";
    this._panel.style.width = "100%";
    this._panel.style.height = "120px";
    this._panel.style.boxSizing = "border-box";
    this._panel.style.background = "rgba(15, 23, 42, 0.85)";
    this._panel.style.borderTop = "1px solid rgba(255, 255, 255, 0.18)";
    this._panel.style.borderRadius = "12px 12px 0 0";
    this._panel.style.padding = "6px 10px";
    this._panel.style.color = "#f8fafc";
    this._panel.style.backdropFilter = "blur(14px)";
    this._panel.style.boxShadow = "0 -4px 24px rgba(0, 0, 0, 0.5)";
    this._panel.style.pointerEvents = "auto";
    this._panel.style.zIndex = "99999";
    this._panel.style.overflow = "hidden";
    this._panel.setAttribute("data-tauri-drag-region", "false");

    this._buildPanelContent();

    this._root.appendChild(this._badge);
    this._root.appendChild(this._panel);
    document.body.appendChild(this._root);

    // Global toggle keybinding ('D' or 'd') & Rapid Simulation Hotkeys (1-7, R)
    window.addEventListener("keydown", (e) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (e.key === "d" || e.key === "D") {
        this.toggle();
        return;
      }

      const hotkeyMap: Record<string, string> = {
        "1": "BB-01",
        "2": "BB-02",
        "3": "BB-03",
        "4": "BB-04",
        "5": "BB-05",
        "6": "BB-06",
        "7": "BB-07",
        r: "RESET",
        R: "RESET",
      };

      if (hotkeyMap[e.key]) {
        this._onAction?.(hotkeyMap[e.key]);
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
      this._modelEl.textContent = `${fileName} ${reloaded ? "(reload)" : "(in-place)"}`;
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
    if (this._detailEl) {
      this._detailEl.textContent = this._activeDetail;
      this._detailEl.title = `Detail: ${this._activeDetail}`;
    }
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
    // Header Row: Compact telemetry cluster
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "5px";
    header.style.paddingBottom = "3px";
    header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";

    // Left info cluster
    const leftCluster = document.createElement("div");
    leftCluster.style.display = "flex";
    leftCluster.style.alignItems = "center";
    leftCluster.style.gap = "6px";

    const title = document.createElement("span");
    title.style.fontWeight = "bold";
    title.style.color = "#38bdf8";
    title.style.fontSize = "10px";
    title.textContent = "⚡ HUD";

    this._stateBadgeEl = document.createElement("span");
    this._stateBadgeEl.style.padding = "1px 6px";
    this._stateBadgeEl.style.borderRadius = "3px";
    this._stateBadgeEl.style.fontWeight = "bold";
    this._stateBadgeEl.style.fontSize = "9px";
    this._stateBadgeEl.textContent = "IDLE";

    this._personaBadgeEl = document.createElement("span");
    this._personaBadgeEl.style.padding = "1px 5px";
    this._personaBadgeEl.style.borderRadius = "3px";
    this._personaBadgeEl.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    this._personaBadgeEl.style.fontSize = "9px";
    this._personaBadgeEl.textContent = "ELI";

    this._modelEl = document.createElement("span");
    this._modelEl.style.color = "#94a3b8";
    this._modelEl.style.fontSize = "9px";
    this._modelEl.textContent = "ELI_Model.vrm";

    leftCluster.appendChild(title);
    leftCluster.appendChild(this._stateBadgeEl);
    leftCluster.appendChild(this._personaBadgeEl);
    leftCluster.appendChild(this._modelEl);

    // Right info cluster
    const rightCluster = document.createElement("div");
    rightCluster.style.display = "flex";
    rightCluster.style.alignItems = "center";
    rightCluster.style.gap = "6px";

    this._crossfadeEl = document.createElement("span");
    this._crossfadeEl.style.color = "#94a3b8";
    this._crossfadeEl.style.fontSize = "9px";
    this._crossfadeEl.textContent = "250ms";

    this._detailEl = document.createElement("span");
    this._detailEl.style.color = "#cbd5e1";
    this._detailEl.style.fontSize = "9px";
    this._detailEl.style.maxWidth = "75px";
    this._detailEl.style.overflow = "hidden";
    this._detailEl.style.textOverflow = "ellipsis";
    this._detailEl.style.whiteSpace = "nowrap";
    this._detailEl.textContent = "initial";

    this._cooldownEl = document.createElement("span");
    this._cooldownEl.style.color = "#fbbf24";
    this._cooldownEl.style.fontSize = "9px";
    this._cooldownEl.textContent = "-";

    this._bridgeStatusEl = document.createElement("span");
    this._bridgeStatusEl.style.fontSize = "9px";
    this._bridgeStatusEl.style.color = "#fbbf24";
    this._bridgeStatusEl.textContent = "OFFLINE";

    const closeBtn = document.createElement("span");
    closeBtn.textContent = "✕";
    closeBtn.style.color = "#94a3b8";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "10px";
    closeBtn.style.marginLeft = "4px";
    closeBtn.title = "Hide HUD [D]";
    closeBtn.addEventListener("click", () => this.hide());

    rightCluster.appendChild(this._crossfadeEl);
    rightCluster.appendChild(this._detailEl);
    rightCluster.appendChild(this._cooldownEl);
    rightCluster.appendChild(this._bridgeStatusEl);
    rightCluster.appendChild(closeBtn);

    header.appendChild(leftCluster);
    header.appendChild(rightCluster);
    this._panel.appendChild(header);

    // Section 1: Black-Box Simulation Triggers (Grid with hotkey hints [1]-[7], [R])
    const btnGrid = document.createElement("div");
    btnGrid.style.display = "grid";
    btnGrid.style.gridTemplateColumns = "repeat(4, 1fr)";
    btnGrid.style.gap = "3px";
    btnGrid.style.marginBottom = "4px";

    const makeBtn = (
      text: string,
      actionKey: string,
      tooltip: string
    ): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = text;
      b.title = tooltip;
      b.style.background = "rgba(30, 41, 59, 0.85)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.15)";
      b.style.borderRadius = "3px";
      b.style.color = "#f1f5f9";
      b.style.fontSize = "9px";
      b.style.padding = "2px 2px";
      b.style.cursor = "pointer";
      b.style.whiteSpace = "nowrap";
      b.style.overflow = "hidden";
      b.style.textOverflow = "ellipsis";
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

    btnGrid.appendChild(makeBtn("[1] BB-01", "BB-01", "[1] BB-01: Idle State"));
    btnGrid.appendChild(makeBtn("[2] BB-02", "BB-02", "[2] BB-02: Think (250ms)"));
    btnGrid.appendChild(makeBtn("[3] BB-03", "BB-03", "[3] BB-03: Speak (Dwell)"));
    btnGrid.appendChild(makeBtn("[4] BB-04", "BB-04", "[4] BB-04: Tool Cycle"));
    btnGrid.appendChild(makeBtn("[5] BB-05", "BB-05", "[5] BB-05: Success (2s)"));
    btnGrid.appendChild(makeBtn("[6] BB-06", "BB-06", "[6] BB-06: Error (150ms)"));
    btnGrid.appendChild(makeBtn("[7] BB-07", "BB-07", "[7] BB-07: Preempt (10ms)"));
    btnGrid.appendChild(makeBtn("[R] Reset", "RESET", "[R] Reset Runtime"));

    this._panel.appendChild(btnGrid);

    // Section 2: Persona Swapping Controls
    const personaRow = document.createElement("div");
    personaRow.style.display = "flex";
    personaRow.style.gap = "4px";
    personaRow.style.alignItems = "center";

    const personaLabel = document.createElement("span");
    personaLabel.style.color = "#64748b";
    personaLabel.style.fontSize = "8px";
    personaLabel.style.letterSpacing = "0.5px";
    personaLabel.textContent = "PERSONA:";
    personaRow.appendChild(personaLabel);

    const makePersonaBtn = (p: PersonaId): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = p.toUpperCase();
      b.style.flex = "1";
      b.style.background = "rgba(30, 41, 59, 0.85)";
      b.style.border = "1px solid rgba(255, 255, 255, 0.15)";
      b.style.borderRadius = "3px";
      b.style.color = "#f1f5f9";
      b.style.fontSize = "9px";
      b.style.padding = "2px 0";
      b.style.cursor = "pointer";
      b.setAttribute("data-tauri-drag-region", "false");
      b.addEventListener("mouseenter", () => {
        b.style.borderColor = "#38bdf8";
      });
      b.addEventListener("mouseleave", () => {
        b.style.borderColor = "rgba(255, 255, 255, 0.15)";
      });
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
