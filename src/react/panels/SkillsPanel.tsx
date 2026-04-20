/**
 * SkillsPanel — modal-ish overlay showing every skill registered with
 * the agent. Primary debugging workflow:
 *
 *   1. "Why didn't Neo pick a skill for my question?"
 *      → open the panel, skim titles/descriptions, realize none match.
 *   2. "What did read_skill('X') actually inject into the conversation?"
 *      → click skill X, see the body markdown + tools[] it exposes.
 *   3. "Is this skill's id the same as what the code expects?"
 *      → raw-JSON view shows the full object.
 *
 * The panel is rendered inline (absolute-positioned cover over the
 * Messages panel) so it respects FootprintTheme + doesn't fight the
 * layout grid. Close via backdrop click or the X button.
 */
import { useState } from "react";
import type { LensSkill } from "../../core/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface SkillsPanelProps {
  readonly skills: readonly LensSkill[];
  readonly onClose: () => void;
  /** Optional — which skill id Neo has currently "activated" (if any).
   *  When provided, it gets a badge + is pre-selected on open. */
  readonly activeSkillId?: string | null;
}

export function SkillsPanel({ skills, onClose, activeSkillId }: SkillsPanelProps) {
  const t = useLensTheme();
  const [selectedId, setSelectedId] = useState<string | null>(
    activeSkillId ?? skills[0]?.id ?? null,
  );
  const [mode, setMode] = useState<"formatted" | "json">("formatted");
  const selected = skills.find((s) => s.id === selectedId) ?? null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 280px) 1fr",
          gridTemplateRows: "auto 1fr",
          gridTemplateAreas: '"header header" "list detail"',
          width: "100%",
          height: "100%",
          background: t.bg,
          color: t.text,
          fontFamily: t.fontSans,
          border: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            gridArea: "header",
            padding: "10px 14px",
            borderBottom: `1px solid ${t.border}`,
            background: t.bgElev,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <strong style={{ color: t.text, fontSize: 13 }}>
            Skills registered with Neo
          </strong>
          <span style={{ color: t.textMuted, fontSize: 12 }}>
            {skills.length} total
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${t.border}`,
              color: t.textMuted,
              borderRadius: 4,
              padding: "2px 10px",
              cursor: "pointer",
              fontSize: 14,
              width: "auto",
              fontWeight: 400,
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Left list */}
        <div
          style={{
            gridArea: "list",
            borderRight: `1px solid ${t.border}`,
            overflow: "auto",
            background: t.bg,
          }}
        >
          {skills.length === 0 && (
            <div style={{ padding: 14, color: t.textSubtle, fontSize: 12 }}>
              No skills registered.
            </div>
          )}
          {skills.map((s) => {
            const isActive = s.id === selectedId;
            const isAgentActive = s.id === activeSkillId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: isActive ? t.bgHover : "transparent",
                  border: "none",
                  borderLeft: `3px solid ${
                    isActive ? t.accent : isAgentActive ? t.success : "transparent"
                  }`,
                  borderBottom: `1px solid ${t.border}`,
                  color: t.text,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {s.title ?? s.id}
                  </span>
                  {isAgentActive && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: `color-mix(in srgb, ${t.success} 25%, transparent)`,
                        color: t.success,
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      active
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: t.textSubtle,
                    fontFamily: t.fontMono,
                    marginTop: 1,
                  }}
                >
                  {s.id}
                  {s.version && ` · v${s.version}`}
                </div>
                {s.description && (
                  <div
                    style={{
                      fontSize: 11,
                      color: t.textMuted,
                      marginTop: 4,
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {s.description}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Right detail */}
        <div
          style={{
            gridArea: "detail",
            overflow: "auto",
            padding: "14px 18px",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {!selected ? (
            <div style={{ color: t.textSubtle }}>Select a skill to see details.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, color: t.text }}>
                  {selected.title ?? selected.id}
                </h2>
                <span style={{ color: t.textSubtle, fontFamily: t.fontMono, fontSize: 11 }}>
                  {selected.id}
                  {selected.version && ` · v${selected.version}`}
                </span>
                <span style={{ flex: 1 }} />
                <div
                  role="tablist"
                  style={{
                    display: "flex",
                    gap: 1,
                    border: `1px solid ${t.border}`,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => setMode("formatted")}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      background: mode === "formatted" ? t.accent : "transparent",
                      color: mode === "formatted" ? "#fff" : t.textMuted,
                      border: "none",
                      cursor: "pointer",
                      width: "auto",
                      fontWeight: 400,
                    }}
                  >
                    Formatted
                  </button>
                  <button
                    onClick={() => setMode("json")}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      background: mode === "json" ? t.accent : "transparent",
                      color: mode === "json" ? "#fff" : t.textMuted,
                      border: "none",
                      cursor: "pointer",
                      width: "auto",
                      fontWeight: 400,
                    }}
                  >
                    Raw JSON
                  </button>
                </div>
              </div>

              {mode === "formatted" ? (
                <SkillFormatted skill={selected} />
              ) : (
                <SkillJson skill={selected} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillFormatted({ skill }: { skill: LensSkill }) {
  const t = useLensTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {skill.description && (
        <section>
          <Label t={t}>Description</Label>
          <div style={{ color: t.text }}>{skill.description}</div>
        </section>
      )}
      {skill.scope && skill.scope.length > 0 && (
        <section>
          <Label t={t}>Scope</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {skill.scope.map((s) => (
              <span
                key={s}
                style={{
                  padding: "2px 8px",
                  background: t.bgElev,
                  border: `1px solid ${t.border}`,
                  borderRadius: 3,
                  fontSize: 11,
                  fontFamily: t.fontMono,
                  color: t.textMuted,
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}
      {skill.tools && skill.tools.length > 0 && (
        <section>
          <Label t={t}>
            Tools this skill exposes · {skill.tools.length}
          </Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {skill.tools.map((id) => (
              <span
                key={id}
                style={{
                  padding: "2px 8px",
                  background: `color-mix(in srgb, ${t.accent} 15%, transparent)`,
                  border: `1px solid ${t.border}`,
                  borderRadius: 3,
                  fontSize: 11,
                  fontFamily: t.fontMono,
                  color: t.accent,
                }}
              >
                {id}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 4, fontStyle: "italic" }}>
            Only these tools reach the LLM while this skill is active (autoActivate).
          </div>
        </section>
      )}
      {skill.body && (
        <section>
          <Label t={t}>Body (sent to LLM on read_skill)</Label>
          <pre
            style={{
              margin: 0,
              padding: "10px 12px",
              background: t.bgElev,
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              fontSize: 12,
              lineHeight: 1.55,
              fontFamily: t.fontMono,
              whiteSpace: "pre-wrap",
              color: t.text,
              maxHeight: 480,
              overflow: "auto",
            }}
          >
            {skill.body}
          </pre>
        </section>
      )}
    </div>
  );
}

function SkillJson({ skill }: { skill: LensSkill }) {
  const t = useLensTheme();
  // Strip body from preview if huge — keep the raw in a separate block
  // so the JSON stays navigable.
  return (
    <pre
      style={{
        margin: 0,
        padding: "10px 12px",
        background: t.bgElev,
        border: `1px solid ${t.border}`,
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.55,
        fontFamily: t.fontMono,
        whiteSpace: "pre-wrap",
        color: t.text,
        maxHeight: "calc(100vh - 200px)",
        overflow: "auto",
      }}
    >
      {safeJsonStringify(skill)}
    </pre>
  );
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v as object)) return "[Circular]";
          seen.add(v as object);
        }
        if (typeof v === "function") return `[function ${v.name || "anonymous"}]`;
        return v;
      },
      2,
    );
  } catch (err) {
    return `[stringify error: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function Label({
  t,
  children,
}: {
  t: ReturnType<typeof useLensTheme>;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        color: t.textSubtle,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}
