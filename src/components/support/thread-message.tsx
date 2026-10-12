import { AttachmentChips, type Attachment } from "@/components/support/attachment-chips";

/** Burbuja de conversación (soporte del suscriptor y bandeja del admin). */
export function ThreadMessage({
  from,
  time,
  body,
  attachments,
  mineLabel = "Tú",
}: {
  from: "me" | "staff";
  time: string;
  body: string;
  attachments?: Attachment[] | null | undefined;
  mineLabel?: string | undefined;
}) {
  const staff = from === "staff";
  return (
    <div className={`flex gap-2 ${staff ? "" : "flex-row-reverse"}`}>
      <div
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          staff ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        }`}
      >
        {staff ? "GP" : mineLabel.charAt(0).toUpperCase()}
      </div>
      <div className={`min-w-0 max-w-[85%] ${staff ? "" : "text-right"}`}>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {staff ? "Soporte" : mineLabel} · {time}
        </p>
        <div
          className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-sm ${
            staff ? "rounded-tl-sm bg-secondary text-secondary-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"
          }`}
        >
          {body}
        </div>
        {attachments && attachments.length > 0 && (
          <div className={`mt-1 flex ${staff ? "justify-start" : "justify-end"}`}>
            <AttachmentChips items={attachments} />
          </div>
        )}
      </div>
    </div>
  );
}
