import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { ScanDocument } from "../mission/ScanDocument";

const scanDocument = vi.fn();
vi.mock("../../api/documents", () => ({ scanDocument: (file: File) => scanDocument(file) }));
// signed in: requireAuth runs the action straight away
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ requireAuth: (action: () => void) => action() }) }));
vi.mock("../mission/MissionForm", () => ({ useApplyTemplate: () => () => undefined }));

function wrap(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const RESULT = { fields: {}, document_kind: "Admit card", missing: ["venue"], notes: [], lines_read: 3,
                 document_deleted: true, read_by: "Cloudinary OCR" };

describe("ScanDocument drag and drop", () => {
  beforeEach(() => {
    scanDocument.mockReset().mockResolvedValue(RESULT);
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("highlights while a file is dragged over and reads the dropped file", async () => {
    render(wrap(<ScanDocument set={() => undefined} />));
    const card = screen.getByRole("region", { name: /admit card/i });
    const file = new File(["x"], "admit.jpg", { type: "image/jpeg" });
    const dataTransfer = { types: ["Files"], files: [file], dropEffect: "none" };
    fireEvent.dragEnter(card, { dataTransfer });
    expect(screen.getByText("Drop to read it")).toBeInTheDocument();
    fireEvent.drop(card, { dataTransfer });
    await waitFor(() => expect(scanDocument).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/Admit card/)).toBeInTheDocument();
  });

  it("rejects files that aren't photos or PDFs before uploading", () => {
    render(wrap(<ScanDocument set={() => undefined} />));
    const card = screen.getByRole("region", { name: /admit card/i });
    const file = new File(["x"], "notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    fireEvent.drop(card, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't a photo or a PDF/);
    expect(scanDocument).not.toHaveBeenCalled();
  });

  it("reads a pasted screenshot", async () => {
    render(wrap(<ScanDocument set={() => undefined} />));
    const file = new File(["x"], "image.png", { type: "image/png" });
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    paste.clipboardData = { files: [file] };
    window.dispatchEvent(paste);
    await waitFor(() => expect(scanDocument).toHaveBeenCalledWith(file));
  });
});
