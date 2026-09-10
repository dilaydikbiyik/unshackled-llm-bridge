/**
 * Files above this are not mirrored into the sandbox. IndexedDB quota is
 * shared and finite, and silently filling it to copy a video is a worse
 * failure than not copying it. Enforced where files are captured and again
 * where they are stored, so neither side trusts the other.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
