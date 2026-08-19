import type { AlertContent } from "./alert-renderer.js";

export function Alert({ content }: { content: AlertContent }) {
  return (
    <div className={content.className} data-testid="alert" style={styles.wrapper}>
      <div style={styles.title}>{content.title}</div>
      {content.subtitle ? <div style={styles.subtitle}>{content.subtitle}</div> : null}
    </div>
  );
}

const styles = {
  wrapper: {
    padding: "12px 20px",
    borderRadius: 12,
    background: "rgba(20,20,20,0.85)",
    color: "white",
    marginBottom: 8,
    animation: "fadeSlideIn 0.3s ease-out",
  } as const,
  title: { fontWeight: 700, fontSize: 18 } as const,
  subtitle: { fontSize: 14, opacity: 0.85 } as const,
};
