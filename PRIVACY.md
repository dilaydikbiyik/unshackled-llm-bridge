# Privacy Policy

**Short version: this extension has no servers, and your conversations never leave your browser.**

## What is collected

Nothing is collected. There is no backend, no account system, no analytics, and no telemetry of any
kind. No data about you or your usage is transmitted to the author or to any third party.

## What is stored, and where

Everything below lives in your browser's local extension storage on this device only. It is never
synced to another device and never uploaded.

| Data | Purpose | Stored where |
|---|---|---|
| Conversation packages you transfer | Moving a conversation to another platform | `chrome.storage.session` — cleared when the browser closes |
| Files you upload to a platform | Replaying them on another platform without re-uploading | IndexedDB |
| Archived conversations | Cross-platform search, only if you turn archiving on | IndexedDB |
| Your persona profile | Attaching your preferences to transfers | `chrome.storage.local` |
| Your Anthropic API key, if you provide one | Summarizing long conversations on transfer | `chrome.storage.local` |
| Settings and language | Preferences | `chrome.storage.local` |

Uninstalling the extension deletes all of it.

## Network requests

The extension makes exactly two kinds of outbound request, and neither carries conversation content
to the author:

1. **Selector configuration.** A periodic fetch of `config/selectors.json` from this project's
   public GitHub repository, so a platform UI change can be fixed without a store update. This is a
   plain file download. Nothing is sent with it.

2. **Summarization, only if you opt in.** If — and only if — you enter your own Anthropic API key
   and choose "transfer summarized", the conversation text is sent from your browser directly to
   `api.anthropic.com` using your key, and the summary comes back to your browser. It does not pass
   through any server operated by this project. Anthropic's handling of that request is governed by
   their own privacy policy and your agreement with them. Leave the API key blank and this request
   is never made.

## Archiving is opt-in

Conversations you visit are archived locally **only** after you enable archiving in the side panel.
It is off by default. Turning it off stops new archiving; existing entries stay until you remove
them or uninstall.

## Diagnostics

The diagnostics report in the side panel contains the extension version, your browser's user agent,
and which DOM selectors are currently failing. It contains no conversation content. It is never
sent anywhere automatically — it is copied to your clipboard for you to share if you choose to.

## Your data on the AI platforms

This extension reads conversations from and writes text into ChatGPT, Claude, and Gemini in your
own logged-in browser session, on your instruction. It does not change what those platforms
themselves collect. Their own privacy policies continue to apply to your use of them.

## Changes

Material changes to this policy will be noted in the repository's commit history and release notes.

## Contact

Open an issue on the project's GitHub repository.
