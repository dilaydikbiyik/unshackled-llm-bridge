/**
 * pdf.js ships its worker as a plain module without types. It is handed to
 * pdf.js whole (see pdfLines), so nothing in it is called from here.
 */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}
