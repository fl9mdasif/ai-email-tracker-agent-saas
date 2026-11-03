import { registerConnector } from "@/core/connectors/registry";
import { gmailConnector } from "./gmail";
import { imapConnector } from "./imap";

/** Registers every connector this module provides. Safe to call more than once. */
export function registerEmailTrackerConnectors(): void {
  registerConnector(imapConnector);
  registerConnector(gmailConnector);
}
